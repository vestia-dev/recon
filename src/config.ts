import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { targets, type ReconConfig, type Rule, type Target } from "./model"

const schemaUrl = "https://raw.githubusercontent.com/vestia-dev/recon/main/recon.schema.json"
const ruleFields = new Set([
  "id",
  "message",
  "target",
  "include",
  "exclude",
  "name",
  "excludeName",
  "extension",
  "excludeExtension",
  "contentRegex",
  "excludeContentRegex",
  "caseSensitive",
])
const configFields = new Set(["$schema", "version", "rules"])

export const emptyConfig = (): ReconConfig => ({
  $schema: schemaUrl,
  version: 1,
  rules: [],
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const stringArray = (value: unknown, field: string): ReadonlyArray<string> | undefined => {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${field} must be an array of non-empty strings`)
  }
  return value
}

const validateRule = (value: unknown, index: number): Rule => {
  if (!isRecord(value)) throw new Error(`rules[${index}] must be an object`)

  for (const field of Object.keys(value)) {
    if (!ruleFields.has(field)) throw new Error(`rules[${index}] has unknown field ${field}`)
  }

  if (typeof value.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)) {
    throw new Error(`rules[${index}].id must use lowercase words separated by hyphens`)
  }
  if (typeof value.message !== "string" || value.message.trim().length === 0) {
    throw new Error(`rules[${index}].message must be a non-empty string`)
  }
  if (typeof value.target !== "string" || !targets.includes(value.target as Target)) {
    throw new Error(`rules[${index}].target must be one of: ${targets.join(", ")}`)
  }
  if (value.caseSensitive !== undefined && typeof value.caseSensitive !== "boolean") {
    throw new Error(`rules[${index}].caseSensitive must be a boolean`)
  }

  const contentRegex = stringArray(value.contentRegex, `rules[${index}].contentRegex`)
  const excludeContentRegex = stringArray(
    value.excludeContentRegex,
    `rules[${index}].excludeContentRegex`,
  )
  if (
    (contentRegex || excludeContentRegex) &&
    value.target !== "added-lines" &&
    value.target !== "deleted-lines"
  ) {
    throw new Error(`rules[${index}] can only use content regexes with a line target`)
  }

  for (const pattern of [...(contentRegex ?? []), ...(excludeContentRegex ?? [])]) {
    try {
      new RegExp(pattern)
    } catch {
      throw new Error(`rules[${index}] has invalid regular expression: ${pattern}`)
    }
  }

  return {
    id: value.id,
    message: value.message.trim(),
    target: value.target as Target,
    include: stringArray(value.include, `rules[${index}].include`),
    exclude: stringArray(value.exclude, `rules[${index}].exclude`),
    name: stringArray(value.name, `rules[${index}].name`),
    excludeName: stringArray(value.excludeName, `rules[${index}].excludeName`),
    extension: stringArray(value.extension, `rules[${index}].extension`),
    excludeExtension: stringArray(value.excludeExtension, `rules[${index}].excludeExtension`),
    contentRegex,
    excludeContentRegex,
    caseSensitive: value.caseSensitive,
  }
}

export const validateConfig = (value: unknown): ReconConfig => {
  if (!isRecord(value)) throw new Error("configuration must be an object")
  for (const field of Object.keys(value)) {
    if (!configFields.has(field)) throw new Error(`configuration has unknown field ${field}`)
  }
  if (value.$schema !== undefined && typeof value.$schema !== "string") {
    throw new Error("$schema must be a string")
  }
  if (value.version !== 1) throw new Error("configuration version must be 1")
  if (!Array.isArray(value.rules)) throw new Error("rules must be an array")

  const rules = value.rules.map(validateRule)
  const ids = new Set<string>()
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new Error(`duplicate rule ID: ${rule.id}`)
    ids.add(rule.id)
  }

  return {
    ...(value.$schema === undefined ? {} : { $schema: value.$schema }),
    version: 1,
    rules,
  }
}

export const readConfig = async (path: string, allowMissing = false): Promise<ReconConfig> => {
  try {
    return validateConfig(JSON.parse(await readFile(path, "utf8")))
  } catch (error) {
    if (allowMissing && isMissingFile(error)) return emptyConfig()
    if (error instanceof SyntaxError) throw new Error(`${path} contains invalid JSON: ${error.message}`)
    throw error
  }
}

const isMissingFile = (error: unknown): boolean =>
  isRecord(error) && error.code === "ENOENT"

export const writeConfig = async (path: string, config: ReconConfig): Promise<void> => {
  const validated = validateConfig(config)
  const temporaryPath = `${path}.${process.pid}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`)
  await rename(temporaryPath, path)
}
