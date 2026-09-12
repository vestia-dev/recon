#!/usr/bin/env bun

import { access } from "node:fs/promises"
import { resolve } from "node:path"
import { emptyConfig, readConfig, writeConfig } from "./config"
import { collectChanges, findGitRoot } from "./git"
import { findGuidance } from "./matcher"
import { targets, type Rule } from "./model"
import { installSkill, removeSkill } from "./skill"
import { updateRecon } from "./update"
import { docsUrl, version } from "./version"

const help = `Recon checks Git changes against repository-defined advisory rules.

Usage: recon [command] [options]

Commands:
  check                         Check current changes (default command)
  init                          Create recon.json
  add                           Add a rule to recon.json
  list                          List configured rules
  show <rule-id>                Print one rule as JSON
  remove <rule-id>              Remove one rule
  skill install|remove          Install or remove the Recon agent skill
  update [version]              Install the latest or specified version
  upgrade [version]             Alias for update
  get-docs-url                  Print the documentation URL

Options:
  -h, --help                    Print command help
  --version                     Print the installed version

Run 'recon get-docs-url' for the complete command and configuration reference.
`

interface ParsedOptions {
  readonly values: ReadonlyMap<string, ReadonlyArray<string>>
  readonly flags: ReadonlySet<string>
  readonly positional: ReadonlyArray<string>
}

const booleanFlags = new Set([
  "help",
  "version",
  "strict",
  "json",
  "staged",
  "case-sensitive",
  "global",
  "force",
])
const valueFlags = new Set([
  "base",
  "config",
  "id",
  "message",
  "target",
  "include",
  "exclude",
  "name",
  "exclude-name",
  "extension",
  "exclude-extension",
  "content-regex",
  "exclude-content-regex",
])

const parseOptions = (args: ReadonlyArray<string>): ParsedOptions => {
  const values = new Map<string, Array<string>>()
  const flags = new Set<string>()
  const positional: Array<string> = []

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "-h") {
      flags.add("help")
      continue
    }
    if (argument === "-g") {
      flags.add("global")
      continue
    }
    if (!argument.startsWith("--")) {
      positional.push(argument)
      continue
    }
    const name = argument.slice(2)
    if (booleanFlags.has(name)) {
      flags.add(name)
      continue
    }
    if (!valueFlags.has(name)) throw new Error(`unknown flag: ${argument}`)
    const value = args[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`)
    index += 1
    values.set(name, [...(values.get(name) ?? []), value])
  }
  return { values, flags, positional }
}

const oneValue = (
  options: ParsedOptions,
  name: string,
  required = false,
): string | undefined => {
  const values = options.values.get(name)
  if (values && values.length > 1) throw new Error(`--${name} can only be provided once`)
  if (required && !values?.[0]) throw new Error(`--${name} is required`)
  return values?.[0]
}

const configPath = (options: ParsedOptions, root: string, cwd: string): string => {
  const configured = oneValue(options, "config")
  return configured ? resolve(cwd, configured) : resolve(root, "recon.json")
}

const rejectUnexpected = (
  options: ParsedOptions,
  allowedValues: ReadonlyArray<string>,
  allowedFlags: ReadonlyArray<string>,
): void => {
  for (const name of options.values.keys()) {
    if (!allowedValues.includes(name)) throw new Error(`--${name} is not valid for this command`)
  }
  for (const name of options.flags) {
    if (!allowedFlags.includes(name)) throw new Error(`--${name} is not valid for this command`)
  }
}

const addRule = async (options: ParsedOptions, path: string): Promise<void> => {
  rejectUnexpected(
    options,
    [
      "config",
      "id",
      "message",
      "target",
      "include",
      "exclude",
      "name",
      "exclude-name",
      "extension",
      "exclude-extension",
      "content-regex",
      "exclude-content-regex",
    ],
    ["case-sensitive"],
  )
  if (options.positional.length > 0) throw new Error("recon add does not accept positional arguments")

  const rule: Rule = {
    id: oneValue(options, "id", true)!,
    message: oneValue(options, "message", true)!,
    target: oneValue(options, "target", true)! as Rule["target"],
    include: options.values.get("include"),
    exclude: options.values.get("exclude"),
    name: options.values.get("name"),
    excludeName: options.values.get("exclude-name"),
    extension: options.values.get("extension"),
    excludeExtension: options.values.get("exclude-extension"),
    contentRegex: options.values.get("content-regex"),
    excludeContentRegex: options.values.get("exclude-content-regex"),
    caseSensitive: options.flags.has("case-sensitive") || undefined,
  }
  if (!targets.includes(rule.target)) throw new Error(`--target must be one of: ${targets.join(", ")}`)

  const config = await readConfig(path, true)
  if (config.rules.some(({ id }) => id === rule.id)) throw new Error(`rule already exists: ${rule.id}`)
  await writeConfig(path, { ...config, rules: [...config.rules, rule] })
  console.log(`Added ${rule.id} to ${path}`)
}

const printFindings = (
  findings: ReturnType<typeof findGuidance>,
  asJson: boolean,
): void => {
  if (asJson) {
    console.log(JSON.stringify({ findings }, null, 2))
    return
  }
  if (findings.length === 0) {
    console.log("Recon found no guidance for the current changes.")
    return
  }
  console.log("Recon guidance:\n")
  for (const finding of findings) {
    console.log(`[${finding.id}] ${finding.message}`)
    for (const location of finding.locations) {
      const line = "line" in location ? `:${location.line}` : ""
      console.log(`  ${location.path}${line}`)
    }
    console.log()
  }
}

const ensureNoPositionals = (options: ParsedOptions, command: string): void => {
  if (options.positional.length > 0) throw new Error(`recon ${command} does not accept positional arguments`)
}

const run = async (args: ReadonlyArray<string>, cwd = process.cwd()): Promise<number> => {
  const first = args[0]
  const command = first && !first.startsWith("-") ? first : "check"
  const commandArgs = command === "check" && first !== "check" ? args : args.slice(1)
  const options = parseOptions(commandArgs)
  if (options.flags.has("help") || command === "help") {
    console.log(help)
    return 0
  }
  if (options.flags.has("version") || command === "version") {
    rejectUnexpected(options, [], ["version"])
    ensureNoPositionals(options, command)
    console.log(`recon ${version}`)
    return 0
  }
  if (command === "get-docs-url") {
    rejectUnexpected(options, [], [])
    ensureNoPositionals(options, command)
    console.log(docsUrl())
    return 0
  }
  if (command === "update" || command === "upgrade") {
    rejectUnexpected(options, [], [])
    if (options.positional.length > 1) throw new Error(`recon ${command} accepts at most one version`)
    console.log(await updateRecon(options.positional[0]))
    return 0
  }
  if (command === "skill") {
    if (options.positional.length !== 1 || !["install", "remove"].includes(options.positional[0]!)) {
      throw new Error("usage: recon skill <install|remove> [-g|--global] [--force]")
    }
    const global = options.flags.has("global")
    const root = global ? undefined : findGitRoot(cwd)
    if (options.positional[0] === "install") {
      rejectUnexpected(options, [], ["global", "force"])
      const path = await installSkill({ root, global, force: options.flags.has("force") })
      console.log(`Installed Recon skill to ${path}`)
    } else {
      rejectUnexpected(options, [], ["global"])
      const path = await removeSkill({ root, global })
      console.log(`Removed Recon skill from ${path}`)
    }
    return 0
  }

  const root = findGitRoot(cwd)
  const path = configPath(options, root, cwd)

  switch (command) {
    case "init": {
      rejectUnexpected(options, ["config"], [])
      ensureNoPositionals(options, command)
      try {
        await access(path)
        throw new Error(`${path} already exists`)
      } catch (error) {
        if (error instanceof Error && error.message === `${path} already exists`) throw error
      }
      await writeConfig(path, emptyConfig())
      console.log(`Created ${path}`)
      return 0
    }
    case "add":
      await addRule(options, path)
      return 0
    case "list": {
      rejectUnexpected(options, ["config"], [])
      ensureNoPositionals(options, command)
      const config = await readConfig(path)
      if (config.rules.length === 0) console.log("No rules configured.")
      else for (const rule of config.rules) console.log(`${rule.id}\t${rule.target}\t${rule.message}`)
      return 0
    }
    case "show": {
      rejectUnexpected(options, ["config"], [])
      if (options.positional.length !== 1) throw new Error("recon show requires one rule ID")
      const config = await readConfig(path)
      const rule = config.rules.find(({ id }) => id === options.positional[0])
      if (!rule) throw new Error(`rule not found: ${options.positional[0]}`)
      console.log(JSON.stringify(rule, null, 2))
      return 0
    }
    case "remove": {
      rejectUnexpected(options, ["config"], [])
      if (options.positional.length !== 1) throw new Error("recon remove requires one rule ID")
      const config = await readConfig(path)
      const rules = config.rules.filter(({ id }) => id !== options.positional[0])
      if (rules.length === config.rules.length) throw new Error(`rule not found: ${options.positional[0]}`)
      await writeConfig(path, { ...config, rules })
      console.log(`Removed ${options.positional[0]} from ${path}`)
      return 0
    }
    case "check": {
      rejectUnexpected(options, ["config", "base"], ["strict", "json", "staged"])
      ensureNoPositionals(options, command)
      const config = await readConfig(path)
      const changes = await collectChanges(root, {
        staged: options.flags.has("staged"),
        base: oneValue(options, "base"),
      })
      const findings = findGuidance(config.rules, changes)
      printFindings(findings, options.flags.has("json"))
      return options.flags.has("strict") && findings.length > 0 ? 1 : 0
    }
    default:
      throw new Error(`unknown command: ${command}`)
  }
}

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    console.error(`recon: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  },
)
