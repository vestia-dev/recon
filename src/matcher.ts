import { basename } from "node:path"
import type { ChangeSet, FileChange, Finding, LineChange, Rule } from "./model"

const escapeRegexCharacter = (character: string): string =>
  /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character

export const globToRegex = (glob: string, caseSensitive: boolean): RegExp => {
  let source = "^"
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index]
    if (character === "*") {
      if (glob[index + 1] === "*") {
        index += 1
        if (glob[index + 1] === "/") {
          index += 1
          source += "(?:.*/)?"
        } else {
          source += ".*"
        }
      } else {
        source += "[^/]*"
      }
    } else if (character === "?") {
      source += "[^/]"
    } else {
      source += escapeRegexCharacter(character)
    }
  }
  return new RegExp(`${source}$`, caseSensitive ? "" : "i")
}

const valuesMatch = (
  candidate: string,
  values: ReadonlyArray<string> | undefined,
  caseSensitive: boolean,
): boolean => {
  if (!values || values.length === 0) return true
  const normalizedCandidate = caseSensitive ? candidate : candidate.toLowerCase()
  return values.some((value) =>
    caseSensitive ? value === normalizedCandidate : value.toLowerCase() === normalizedCandidate,
  )
}

const valuesExclude = (
  candidate: string,
  values: ReadonlyArray<string> | undefined,
  caseSensitive: boolean,
): boolean => values !== undefined && values.length > 0 && valuesMatch(candidate, values, caseSensitive)

const extensionsMatch = (
  path: string,
  extensions: ReadonlyArray<string> | undefined,
  caseSensitive: boolean,
): boolean => {
  if (!extensions || extensions.length === 0) return true
  const candidate = caseSensitive ? path : path.toLowerCase()
  return extensions.some((extension) => {
    const normalized = extension.startsWith(".") ? extension : `.${extension}`
    return candidate.endsWith(caseSensitive ? normalized : normalized.toLowerCase())
  })
}

const extensionsExclude = (
  path: string,
  extensions: ReadonlyArray<string> | undefined,
  caseSensitive: boolean,
): boolean =>
  extensions !== undefined &&
  extensions.length > 0 &&
  extensionsMatch(path, extensions, caseSensitive)

const compileRule = (rule: Rule): ((change: FileChange | LineChange) => boolean) => {
  const caseSensitive = rule.caseSensitive ?? false
  const includes = rule.include?.map((glob) => globToRegex(glob, caseSensitive)) ?? []
  const excludes = rule.exclude?.map((glob) => globToRegex(glob, caseSensitive)) ?? []
  const content = rule.contentRegex?.map(
    (pattern) => new RegExp(pattern, caseSensitive ? "" : "i"),
  )
  const excludedContent = rule.excludeContentRegex?.map(
    (pattern) => new RegExp(pattern, caseSensitive ? "" : "i"),
  )

  return (change) => {
    const name = basename(change.path)
    if (includes.length > 0 && !includes.some((pattern) => pattern.test(change.path))) return false
    if (excludes.some((pattern) => pattern.test(change.path))) return false
    if (!valuesMatch(name, rule.name, caseSensitive)) return false
    if (valuesExclude(name, rule.excludeName, caseSensitive)) return false
    if (!extensionsMatch(change.path, rule.extension, caseSensitive)) return false
    if (extensionsExclude(change.path, rule.excludeExtension, caseSensitive)) return false

    if ("content" in change) {
      if (content && content.length > 0 && !content.some((pattern) => pattern.test(change.content))) {
        return false
      }
      if (excludedContent?.some((pattern) => pattern.test(change.content))) return false
    }
    return true
  }
}

const changesForRule = (
  rule: Rule,
  changes: ChangeSet,
): ReadonlyArray<FileChange | LineChange> => {
  switch (rule.target) {
    case "added-files":
      return changes.addedFiles
    case "added-lines":
      return changes.addedLines
    case "deleted-files":
      return changes.deletedFiles
    case "deleted-lines":
      return changes.deletedLines
  }
}

export const findGuidance = (
  rules: ReadonlyArray<Rule>,
  changes: ChangeSet,
): ReadonlyArray<Finding> =>
  rules.flatMap((rule) => {
    const locations = changesForRule(rule, changes).filter(compileRule(rule))
    return locations.length === 0
      ? []
      : [{ id: rule.id, message: rule.message, target: rule.target, locations }]
  })
