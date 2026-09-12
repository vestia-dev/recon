export const targets = ["added-files", "added-lines", "deleted-files", "deleted-lines"] as const

export type Target = (typeof targets)[number]

export interface Rule {
  readonly id: string
  readonly message: string
  readonly target: Target
  readonly include?: ReadonlyArray<string>
  readonly exclude?: ReadonlyArray<string>
  readonly name?: ReadonlyArray<string>
  readonly excludeName?: ReadonlyArray<string>
  readonly extension?: ReadonlyArray<string>
  readonly excludeExtension?: ReadonlyArray<string>
  readonly contentRegex?: ReadonlyArray<string>
  readonly excludeContentRegex?: ReadonlyArray<string>
  readonly caseSensitive?: boolean
}

export interface ReconConfig {
  readonly $schema?: string
  readonly version: 1
  readonly rules: ReadonlyArray<Rule>
}

export interface FileChange {
  readonly path: string
}

export interface LineChange extends FileChange {
  readonly line: number
  readonly content: string
}

export interface ChangeSet {
  readonly addedFiles: ReadonlyArray<FileChange>
  readonly addedLines: ReadonlyArray<LineChange>
  readonly deletedFiles: ReadonlyArray<FileChange>
  readonly deletedLines: ReadonlyArray<LineChange>
}

export interface Finding {
  readonly id: string
  readonly message: string
  readonly target: Target
  readonly locations: ReadonlyArray<FileChange | LineChange>
}
