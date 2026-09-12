import { describe, expect, test } from "bun:test"
import { normalizeVersion } from "../src/update"
import { docsUrl, version } from "../src/version"

describe("release versions", () => {
  test("normalizes tagged and untagged versions", () => {
    expect(normalizeVersion("0.2.0")).toBe("0.2.0")
    expect(normalizeVersion("v0.2.0-beta.1")).toBe("0.2.0-beta.1")
  })

  test("rejects invalid versions", () => {
    expect(() => normalizeVersion("latest")).toThrow("invalid version")
  })

  test("uses current documentation during development", () => {
    expect(version).toBe("development")
    expect(docsUrl()).toBe("https://github.com/vestia-dev/recon/blob/main/README.md")
  })
})
