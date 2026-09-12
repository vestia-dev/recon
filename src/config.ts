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
const configFields = new Set(["$schema", "configVersion", "rules"])

export const emptyConfig = (): ReconConfig => ({
  $schema: schemaUrl,
  configVersion: 1,
  rules: [],
})

const stringArray = (value: unknown, field: string): ReadonlyArray<string> | undefined => {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${field} must be an array of non-empty strings`)
  }
  return value
}

const validateRule = (value: unknown, index: number): Rule => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`rules[${index}] must be an object`)
  }
  const input = value as { readonly [field: string]: unknown }

  for (const field of Object.keys(input)) {
    if (!ruleFields.has(field)) throw new Error(`rules[${index}] has unknown field ${field}`)
  }

  if (
    typeof input.id !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id)
  ) {
    throw new Error(`rules[${index}].id must use lowercase words separated by hyphens`)
  }
  if (
    typeof input.message !== "string" ||
    input.message.trim().length === 0
  ) {
    throw new Error(`rules[${index}].message must be a non-empty string`)
  }
  if (
    typeof input.target !== "string" ||
    !targets.includes(input.target as Target)
  ) {
    throw new Error(`rules[${index}].target must be one of: ${targets.join(", ")}`)
  }
  const caseSensitive = input.caseSensitive
  if (caseSensitive !== undefined && typeof caseSensitive !== "boolean") {
    throw new Error(`rules[${index}].caseSensitive must be a boolean`)
  }

  const contentRegex = stringArray(input.contentRegex, `rules[${index}].contentRegex`)
  const excludeContentRegex = stringArray(
    input.excludeContentRegex,
    `rules[${index}].excludeContentRegex`,
  )
  if (
    (contentRegex || excludeContentRegex) &&
    input.target !== "added-lines" &&
    input.target !== "deleted-lines"
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
    id: input.id,
    message: input.message.trim(),
    target: input.target as Target,
    include: stringArray(input.include, `rules[${index}].include`),
    exclude: stringArray(input.exclude, `rules[${index}].exclude`),
    name: stringArray(input.name, `rules[${index}].name`),
    excludeName: stringArray(input.excludeName, `rules[${index}].excludeName`),
    extension: stringArray(input.extension, `rules[${index}].extension`),
    excludeExtension: stringArray(input.excludeExtension, `rules[${index}].excludeExtension`),
    contentRegex,
    excludeContentRegex,
    caseSensitive,
  }
}

export const validateConfig = (value: unknown): ReconConfig => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("configuration must be an object")
  }
  const input = value as { readonly [field: string]: unknown }
  for (const field of Object.keys(input)) {
    if (!configFields.has(field)) throw new Error(`configuration has unknown field ${field}`)
  }
  const schema = input.$schema
  if (schema !== undefined && typeof schema !== "string") {
    throw new Error("$schema must be a string")
  }
  if (input.configVersion !== 1) {
    throw new Error("configVersion must be 1")
  }
  if (!Array.isArray(input.rules)) throw new Error("rules must be an array")

  const rules = input.rules.map(validateRule)
  const ids = new Set<string>()
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new Error(`duplicate rule ID: ${rule.id}`)
    ids.add(rule.id)
  }

  return {
    ...(schema === undefined ? {} : { $schema: schema }),
    configVersion: 1,
    rules,
  }
}

export const readConfig = async (path: string, allowMissing = false): Promise<ReconConfig> => {
  try {
    return validateConfig(JSON.parse(await readFile(path, "utf8")))
  } catch (error) {
    if (allowMissing && error instanceof Error && "code" in error && error.code === "ENOENT") {
      return emptyConfig()
    }
    if (error instanceof SyntaxError) throw new Error(`${path} contains invalid JSON: ${error.message}`)
    throw error
  }
}

export const writeConfig = async (path: string, config: ReconConfig): Promise<void> => {
  const validated = validateConfig(config)
  const temporaryPath = `${path}.${process.pid}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`)
  await rename(temporaryPath, path)
}
