import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

const directories: Array<string> = []
const cli = join(import.meta.dir, "../src/cli.ts")

const command = (cwd: string, ...args: ReadonlyArray<string>) =>
  Bun.spawnSync([process.execPath, cli, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })

const git = (cwd: string, ...args: ReadonlyArray<string>) => {
  const result = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" })
  if (!result.success) throw new Error(result.stderr.toString())
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe("Recon CLI", () => {
  test("adds, checks, lists, shows, and removes a rule", async () => {
    const root = await mkdtemp(join(tmpdir(), "recon-cli-test-"))
    directories.push(root)
    git(root, "init", "-b", "main")
    git(root, "config", "user.email", "recon@example.com")
    git(root, "config", "user.name", "Recon Test")
    await mkdir(join(root, "src"))
    await writeFile(join(root, "src/client.ts"), "original\n")
    git(root, "add", ".")
    git(root, "commit", "-m", "Initial commit")

    const added = command(
      root,
      "add",
      "--id",
      "immutable-client",
      "--message",
      "Do not add lines to the client.",
      "--target",
      "added-lines",
      "--include",
      "src/client.ts",
    )
    expect(added.success).toBeTrue()

    await writeFile(join(root, "src/client.ts"), "original\nchanged\n")
    const checked = command(root)
    expect(checked.success).toBeTrue()
    expect(checked.stdout.toString()).toContain("[immutable-client]")
    expect(checked.stdout.toString()).toContain("src/client.ts:2")

    const strict = command(root, "--strict")
    expect(strict.exitCode).toBe(1)

    const listed = command(root, "list")
    expect(listed.stdout.toString()).toContain("immutable-client\tadded-lines")

    const shown = command(root, "show", "immutable-client")
    expect(JSON.parse(shown.stdout.toString())).toMatchObject({ id: "immutable-client" })

    const removed = command(root, "remove", "immutable-client")
    expect(removed.success).toBeTrue()
    expect(command(root, "list").stdout.toString()).toContain("No rules configured.")
  })
})
