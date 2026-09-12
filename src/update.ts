import { createHash } from "node:crypto"
import { chmod, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { updateInstalledSkills } from "./skill"
import { buildTarget, version } from "./version"

const repository = "vestia-dev/recon"
const releaseRoot = `https://github.com/${repository}/releases`

export const normalizeVersion = (requested: string): string => {
  const normalized = requested.startsWith("v") ? requested.slice(1) : requested
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw new Error(`invalid version: ${requested}`)
  }
  return normalized
}

const latestVersion = async (): Promise<string> => {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": `recon/${version}` },
  })
  if (!response.ok) throw new Error(`could not resolve the latest version (${response.status})`)
  const release: unknown = await response.json()
  if (
    typeof release !== "object" ||
    release === null ||
    !("tag_name" in release) ||
    typeof release.tag_name !== "string"
  ) {
    throw new Error("GitHub returned an invalid latest release")
  }
  return normalizeVersion(release.tag_name)
}

const download = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url, {
    headers: { "User-Agent": `recon/${version}` },
    redirect: "follow",
  })
  if (!response.ok) throw new Error(`download failed (${response.status}): ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

const expectedChecksum = (checksums: string, artifact: string): string => {
  const entry = checksums
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1] === artifact)
  if (!entry?.[0] || !/^[a-f0-9]{64}$/.test(entry[0])) {
    throw new Error(`release checksum is missing for ${artifact}`)
  }
  return entry[0]
}

const replaceOnWindows = async (executable: string, replacement: string): Promise<void> => {
  const script = `${replacement}.ps1`
  await writeFile(
    script,
    `param([int]$ReconProcess, [string]$Replacement, [string]$Executable, [string]$Script)\n` +
      `Wait-Process -Id $ReconProcess\n` +
      `Move-Item -Force $Replacement $Executable\n` +
      `Remove-Item -Force $Script\n`,
  )
  const child = Bun.spawn(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      String(process.pid),
      replacement,
      executable,
      script,
    ],
    { stdin: "ignore", stdout: "ignore", stderr: "ignore" },
  )
  child.unref()
}

const withUpdatedSkills = (message: string, paths: ReadonlyArray<string>): string =>
  paths.length === 0 ? message : `${message}\nUpdated Recon skill at ${paths.join(", ")}.`

export const updateRecon = async (requested?: string, root?: string): Promise<string> => {
  if (!Bun.isStandaloneExecutable || version === "development" || buildTarget === "development") {
    throw new Error("self-update is only available in an official standalone Recon executable")
  }

  const targetVersion = requested ? normalizeVersion(requested) : await latestVersion()
  if (targetVersion === version) {
    return withUpdatedSkills(`Recon ${version} is already installed.`, await updateInstalledSkills(root))
  }

  const artifact = `recon-${buildTarget}${process.platform === "win32" ? ".exe" : ""}`
  const skillArtifact = "recon-skill.md"
  const release = `${releaseRoot}/download/v${targetVersion}`
  const [binary, skill, checksums] = await Promise.all([
    download(`${release}/${artifact}`),
    download(`${release}/${skillArtifact}`),
    download(`${release}/checksums.txt`).then((bytes) => new TextDecoder().decode(bytes)),
  ])
  const actual = createHash("sha256").update(binary).digest("hex")
  const expected = expectedChecksum(checksums, artifact)
  if (actual !== expected) throw new Error(`checksum verification failed for ${artifact}`)
  const actualSkill = createHash("sha256").update(skill).digest("hex")
  const expectedSkill = expectedChecksum(checksums, skillArtifact)
  if (actualSkill !== expectedSkill) throw new Error(`checksum verification failed for ${skillArtifact}`)

  const executable = process.execPath
  const replacement = join(dirname(executable), `.recon-update-${process.pid}${process.platform === "win32" ? ".exe" : ""}`)
  try {
    await writeFile(replacement, binary)
    const skillPaths = await updateInstalledSkills(root, new TextDecoder().decode(skill))
    if (process.platform === "win32") {
      await replaceOnWindows(executable, replacement)
      return withUpdatedSkills(
        `Recon will update from ${version} to ${targetVersion} after this command exits.`,
        skillPaths,
      )
    }
    await chmod(replacement, 0o755)
    await rename(replacement, executable)
    return withUpdatedSkills(`Updated Recon from ${version} to ${targetVersion}.`, skillPaths)
  } catch (error) {
    await rm(replacement, { force: true }).catch(() => undefined)
    throw error
  }
}
