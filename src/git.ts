import { lstat, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { ChangeSet, FileChange, LineChange } from "./model"

export interface ChangeOptions {
  readonly staged?: boolean
  readonly base?: string
}

const runGit = (
  args: ReadonlyArray<string>,
  cwd: string,
  allowFailure = false,
): { readonly success: boolean; readonly stdout: Buffer } => {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  if (!result.success && !allowFailure) {
    throw new Error(result.stderr.toString().trim() || `git ${args.join(" ")} failed`)
  }
  return { success: result.success, stdout: Buffer.from(result.stdout) }
}

const splitPaths = (output: Buffer): ReadonlyArray<string> =>
  output
    .toString()
    .split("\0")
    .filter(Boolean)

export const findGitRoot = (cwd: string): string =>
  runGit(["rev-parse", "--show-toplevel"], cwd).stdout.toString().trim()

const comparison = (root: string, options: ChangeOptions): ReadonlyArray<string> | undefined => {
  if (options.staged && options.base) throw new Error("--staged and --base cannot be used together")
  if (options.staged) return ["--cached"]
  if (options.base) {
    runGit(["rev-parse", "--verify", `${options.base}^{commit}`], root)
    return [options.base]
  }
  const hasHead = runGit(["rev-parse", "--verify", "HEAD"], root, true).success
  return hasHead ? ["HEAD"] : undefined
}

const diffOutput = (
  root: string,
  comparisonArgs: ReadonlyArray<string>,
  args: ReadonlyArray<string>,
): Buffer =>
  runGit(
    [
      "-c",
      "core.quotePath=false",
      "diff",
      "--find-renames",
      ...comparisonArgs,
      ...args,
      "--",
      ".",
    ],
    root,
  ).stdout

const changedPaths = (
  root: string,
  comparisonArgs: ReadonlyArray<string>,
  filter: "A" | "D",
): ReadonlyArray<string> =>
  splitPaths(diffOutput(root, comparisonArgs, ["--name-only", `--diff-filter=${filter}`, "-z"]))

const patchLines = (
  root: string,
  comparisonArgs: ReadonlyArray<string>,
): { readonly added: ReadonlyArray<LineChange>; readonly deleted: ReadonlyArray<LineChange> } => {
  const patch = diffOutput(root, comparisonArgs, ["--no-ext-diff", "--no-color", "--unified=0"])
    .toString()
    .split("\n")
  const added: Array<LineChange> = []
  const deleted: Array<LineChange> = []
  let oldPath: string | undefined
  let newPath: string | undefined
  let oldLine = 0
  let newLine = 0

  for (const line of patch) {
    if (line.startsWith("--- ")) {
      const path = line.slice(4)
      oldPath = path === "/dev/null" ? undefined : path.replace(/^a\//, "")
      continue
    }
    if (line.startsWith("+++ ")) {
      const path = line.slice(4)
      newPath = path === "/dev/null" ? undefined : path.replace(/^b\//, "")
      continue
    }
    if (line.startsWith("@@ ")) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line)
      oldLine = match ? Number(match[1]) : 0
      newLine = match ? Number(match[2]) : 0
      continue
    }
    if (line.startsWith("+") && newPath) {
      added.push({ path: newPath, line: newLine, content: line.slice(1) })
      newLine += 1
    } else if (line.startsWith("-") && oldPath) {
      deleted.push({ path: oldPath, line: oldLine, content: line.slice(1) })
      oldLine += 1
    } else if (!line.startsWith("\\")) {
      oldLine += 1
      newLine += 1
    }
  }
  return { added, deleted }
}

const readTextLines = async (root: string, paths: ReadonlyArray<string>): Promise<ReadonlyArray<LineChange>> => {
  const files = await Promise.all(
    paths.map(async (path) => {
      const absolutePath = join(root, path)
      const status = await lstat(absolutePath)
      if (!status.isFile()) return undefined
      const content = await readFile(absolutePath)
      if (content.subarray(0, 8192).includes(0)) return undefined
      return { path, content: content.toString() }
    }),
  )

  return files.flatMap((file) => {
    if (!file || file.content.length === 0) return []
    const lines = file.content.split("\n")
    if (file.content.endsWith("\n")) lines.pop()
    return lines.map((content, index) => ({ path: file.path, line: index + 1, content }))
  })
}

const uniqueFiles = (...groups: ReadonlyArray<ReadonlyArray<string>>): ReadonlyArray<FileChange> =>
  [...new Set(groups.flat())].sort().map((path) => ({ path }))

export const collectChanges = async (
  root: string,
  options: ChangeOptions = {},
): Promise<ChangeSet> => {
  const comparisonArgs = comparison(root, options)
  const includeUntracked = !options.staged

  if (!comparisonArgs) {
    const paths = splitPaths(
      runGit(["ls-files", "--cached", "--others", "--exclude-standard", "-z"], root).stdout,
    )
    return {
      addedFiles: uniqueFiles(paths),
      addedLines: await readTextLines(root, paths),
      deletedFiles: [],
      deletedLines: [],
    }
  }

  const untracked = includeUntracked
    ? splitPaths(runGit(["ls-files", "--others", "--exclude-standard", "-z"], root).stdout)
    : []
  const patch = patchLines(root, comparisonArgs)

  return {
    addedFiles: uniqueFiles(changedPaths(root, comparisonArgs, "A"), untracked),
    addedLines: [...patch.added, ...(await readTextLines(root, untracked))],
    deletedFiles: uniqueFiles(changedPaths(root, comparisonArgs, "D")),
    deletedLines: patch.deleted,
  }
}
