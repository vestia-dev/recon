import { mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"
import skillContents from "../skills/recon/SKILL.md" with { type: "text" }

interface SkillOptions {
  readonly root?: string
  readonly global: boolean
}

interface InstallSkillOptions extends SkillOptions {
  readonly force: boolean
}

const configHome = (): string =>
  process.env.XDG_CONFIG_HOME?.trim() || resolve(homedir(), ".config")

const skillPath = (options: SkillOptions): string => {
  if (options.global) return resolve(configHome(), "agents/skills/recon/SKILL.md")
  if (!options.root) throw new Error("a Git repository is required for project installation")
  return resolve(options.root, ".agents/skills/recon/SKILL.md")
}

const readExisting = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw error
  }
}

const writeSkill = async (path: string, contents: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents, "utf8")
}

export const installSkill = async (options: InstallSkillOptions): Promise<string> => {
  const path = skillPath(options)
  const existing = await readExisting(path)
  if (existing !== undefined && existing !== skillContents && !options.force) {
    throw new Error(`${path} already exists and differs from the bundled skill; use --force to replace it`)
  }

  await writeSkill(path, skillContents)
  return path
}

export const updateSkill = async (options: SkillOptions): Promise<string> => {
  const path = skillPath(options)
  if ((await readExisting(path)) === undefined) {
    throw new Error(`Recon skill is not installed at ${path}`)
  }
  await writeSkill(path, skillContents)
  return path
}

export const updateInstalledSkills = async (
  root: string | undefined,
  contents = skillContents,
): Promise<ReadonlyArray<string>> => {
  const paths = [skillPath({ root, global: true })]
  if (root) paths.unshift(skillPath({ root, global: false }))
  const installed = (
    await Promise.all(paths.map(async (path) => ((await readExisting(path)) === undefined ? undefined : path)))
  ).filter((path): path is string => path !== undefined)
  await Promise.all(installed.map((path) => writeSkill(path, contents)))
  return installed
}

export const removeSkill = async (options: SkillOptions): Promise<string> => {
  const path = skillPath(options)
  try {
    await unlink(path)
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Recon skill is not installed at ${path}`)
    }
    throw error
  }

  try {
    await rmdir(dirname(path))
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      (error.code !== "ENOTEMPTY" && error.code !== "ENOENT")
    ) {
      throw error
    }
  }
  return path
}
