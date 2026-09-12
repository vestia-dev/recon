import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { collectChanges, findGitRoot } from "../src/git"

const directories: Array<string> = []

const git = (cwd: string, ...args: ReadonlyArray<string>) => {
  const result = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" })
  if (!result.success) throw new Error(result.stderr.toString())
}

const repository = async () => {
  const root = await mkdtemp(join(tmpdir(), "recon-test-"))
  directories.push(root)
  git(root, "init", "-b", "main")
  git(root, "config", "user.email", "recon@example.com")
  git(root, "config", "user.name", "Recon Test")
  await mkdir(join(root, "src"))
  await mkdir(join(root, "migrations"))
  await writeFile(join(root, "src/auth.ts"), "keep\nrequirePermission(user)\n")
  await writeFile(join(root, "migrations/001.sql"), "create table users;\n")
  git(root, "add", ".")
  git(root, "commit", "-m", "Initial commit")
  return root
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe("Git changes", () => {
  test("collects added and deleted files and lines", async () => {
    const root = await repository()
    await writeFile(join(root, "src/auth.ts"), "keep\nreplacement\n")
    await rm(join(root, "migrations/001.sql"))
    await writeFile(join(root, "src/new.ts"), "export interface User {}\n")

    const changes = await collectChanges(root)

    expect(changes.addedFiles).toEqual([{ path: "src/new.ts" }])
    expect(changes.deletedFiles).toEqual([{ path: "migrations/001.sql" }])
    expect(changes.addedLines).toContainEqual({ path: "src/auth.ts", line: 2, content: "replacement" })
    expect(changes.addedLines).toContainEqual({
      path: "src/new.ts",
      line: 1,
      content: "export interface User {}",
    })
    expect(changes.deletedLines).toContainEqual({
      path: "src/auth.ts",
      line: 2,
      content: "requirePermission(user)",
    })
    expect(changes.deletedLines).toContainEqual({
      path: "migrations/001.sql",
      line: 1,
      content: "create table users;",
    })
  })

  test("finds the Git root from a nested directory", async () => {
    const root = await repository()
    const nested = join(root, "src", "nested")
    await mkdir(nested)
    expect(findGitRoot(nested)).toBe(await realpath(root))
  })
})
