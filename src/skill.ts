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

export const installSkill = async (options: InstallSkillOptions): Promise<string> => {
  const path = skillPath(options)
  const existing = await readExisting(path)
  if (existing !== undefined && existing !== skillContents && !options.force) {
    throw new Error(`${path} already exists and differs from the bundled skill; use --force to replace it`)
  }

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, skillContents, "utf8")
  return path
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
