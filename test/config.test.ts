import { describe, expect, test } from "bun:test"
import { emptyConfig, validateConfig } from "../src/config"

describe("configuration", () => {
  test("accepts a valid rule", () => {
    expect(
      validateConfig({
        configVersion: 1,
        rules: [
          {
            id: "no-snapshots",
            message: "Do not add snapshots.",
            target: "added-files",
            extension: [".snap"],
          },
        ],
      }).rules,
    ).toHaveLength(1)
  })

  test("rejects content matching for file targets", () => {
    expect(() =>
      validateConfig({
        configVersion: 1,
        rules: [
          {
            id: "invalid",
            message: "Invalid rule.",
            target: "added-files",
            contentRegex: ["type"],
          },
        ],
      }),
    ).toThrow("content regexes")
  })

  test("creates a versioned empty configuration", () => {
    expect(emptyConfig()).toMatchObject({ configVersion: 1, rules: [] })
  })

  test("rejects the obsolete version field", () => {
    expect(() => validateConfig({ version: 1, rules: [] })).toThrow("unknown field version")
  })
})
