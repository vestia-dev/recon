import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"

const targets = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-arm64",
  "bun-linux-x64",
  "bun-linux-arm64-musl",
  "bun-linux-x64-musl",
  "bun-windows-arm64",
  "bun-windows-x64",
] as const

const outputDirectory = "dist/release"
await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })

const artifacts: Array<string> = []
for (const target of targets) {
  const name = `recon-${target.replace(/^bun-/, "")}${target.includes("windows") ? ".exe" : ""}`
  const path = `${outputDirectory}/${name}`
  console.log(`Building ${name}`)
  const result = Bun.spawnSync(
    [
      process.execPath,
      "scripts/build.ts",
      `--target=${target}`,
      `--outfile=${path}`,
    ],
    { stdout: "inherit", stderr: "inherit" },
  )
  if (!result.success) throw new Error(`failed to build ${name}`)
  artifacts.push(name)
}

const skillArtifact = "recon-skill.md"
await copyFile("skills/recon/SKILL.md", `${outputDirectory}/${skillArtifact}`)
artifacts.push(skillArtifact)

const checksums = await Promise.all(
  artifacts.map(async (artifact) => {
    const digest = createHash("sha256")
      .update(await readFile(`${outputDirectory}/${artifact}`))
      .digest("hex")
    return `${digest}  ${artifact}`
  }),
)
await writeFile(`${outputDirectory}/checksums.txt`, `${checksums.join("\n")}\n`)
await copyFile("install.sh", `${outputDirectory}/install.sh`)
await copyFile("install.ps1", `${outputDirectory}/install.ps1`)
console.log(`Release artifacts written to ${outputDirectory}`)
