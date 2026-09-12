# Recon

Recon compares Git changes with repository-defined advisory rules.

- Recon is language-independent.
- Rules are stored in `recon.json`.
- Findings exit with status `0` by default.
- `--strict` makes findings exit with status `1`.
- The standalone executable does not require Bun or Node.js.
- Git is required for rule management and change checking.

## Install

### macOS and Linux

```sh
curl -fsSL https://github.com/vestia-dev/recon/releases/latest/download/install.sh | sh
```

The default installation path is `~/.local/bin/recon`. Set
`RECON_INSTALL_DIR` to use another directory.

### Windows PowerShell

```powershell
irm https://github.com/vestia-dev/recon/releases/latest/download/install.ps1 | iex
```

The default installation path is
`%LOCALAPPDATA%\Programs\Recon\recon.exe`. The installer adds that directory to
the user `PATH`. Restart the terminal after the first installation.

Both installers detect the operating system and architecture, download the
appropriate executable from the latest GitHub Release, and verify its SHA-256
checksum.

## Quick start

Run these commands inside a Git repository:

```sh
recon init
recon add \
  --id new-types \
  --message "Make sure the new type cannot be derived from the source of truth." \
  --target added-lines \
  --extension .ts \
  --extension .tsx \
  --content-regex '^\s*(?:export\s+)?(?:type|interface)\s+'
recon
```

`recon init` creates `recon.json` at the Git root. `recon add` also creates it
when it does not exist.

## Command reference

### `recon check`

Check the current Git changes. Running `recon` without a command is equivalent
to `recon check`.

```text
recon [check] [--staged | --base <ref>] [--strict] [--json] [--config <path>]
```

| Flag | Value | Repeatable | Behavior |
| --- | --- | --- | --- |
| `--staged` | None | No | Check only changes in the Git index. |
| `--base` | Git revision | No | Compare the current index and working tree with the revision. |
| `--strict` | None | No | Exit with status `1` when findings exist. |
| `--json` | None | No | Print structured JSON instead of text. |
| `--config` | File path | No | Read configuration from this path instead of `<git-root>/recon.json`. |

Without `--staged` or `--base`, Recon compares the current index and working
tree with `HEAD` and includes untracked files. `--staged` and `--base` cannot be
used together.

### `recon init`

Create an empty configuration. The command fails if the file already exists.

```text
recon init [--config <path>]
```

| Flag | Value | Repeatable | Behavior |
| --- | --- | --- | --- |
| `--config` | File path | No | Write configuration to this path instead of `<git-root>/recon.json`. |

### `recon add`

Append one rule to the configuration. The command fails when the rule ID
already exists or any field is invalid.

```text
recon add --id <id> --message <message> --target <target> [match flags] [--config <path>]
```

| Flag | Value | Required | Repeatable | Configuration field |
| --- | --- | --- | --- | --- |
| `--id` | Lowercase hyphenated ID | Yes | No | `id` |
| `--message` | Guidance text | Yes | No | `message` |
| `--target` | Change target | Yes | No | `target` |
| `--include` | Path glob | No | Yes | `include` |
| `--exclude` | Path glob | No | Yes | `exclude` |
| `--name` | Exact file name | No | Yes | `name` |
| `--exclude-name` | Exact file name | No | Yes | `excludeName` |
| `--extension` | File extension | No | Yes | `extension` |
| `--exclude-extension` | File extension | No | Yes | `excludeExtension` |
| `--content-regex` | Regular expression | No | Yes | `contentRegex` |
| `--exclude-content-regex` | Regular expression | No | Yes | `excludeContentRegex` |
| `--case-sensitive` | None | No | No | `caseSensitive: true` |
| `--config` | File path | No | No | Not stored |

Valid targets:

| Target | Candidate supplied to the rule |
| --- | --- |
| `added-files` | Each file added relative to the selected Git comparison. |
| `added-lines` | Each line added relative to the selected Git comparison. |
| `deleted-files` | Each file deleted relative to the selected Git comparison. |
| `deleted-lines` | Each line deleted relative to the selected Git comparison. |

Content regular expressions are valid only with `added-lines` and
`deleted-lines`.

### `recon list`

Print every configured rule as tab-separated ID, target, and message fields.

```text
recon list [--config <path>]
```

### `recon show`

Print one rule as JSON.

```text
recon show <rule-id> [--config <path>]
```

### `recon remove`

Remove one rule by ID.

```text
recon remove <rule-id> [--config <path>]
```

### `recon update` and `recon upgrade`

`update` and `upgrade` are aliases. With no version, they install the latest
GitHub Release. With a version, they install exactly that version, including an
older version.

```text
recon update [version]
recon upgrade [version]
```

Versions may include or omit the `v` prefix:

```sh
recon update
recon update 0.2.0
recon upgrade v0.2.0
```

Self-update verifies the executable against the release checksum and is
available only in official standalone builds.

### `recon get-docs-url`

Print the README URL pinned to the installed Recon version.

```text
recon get-docs-url
```

Example output:

```text
https://github.com/vestia-dev/recon/blob/v0.1.0/README.md
```

### `recon --version`

Print the installed Recon version.

```text
recon --version
```

## `recon.json` reference

The default configuration path is `<git-root>/recon.json`.

```json
{
  "$schema": "https://raw.githubusercontent.com/vestia-dev/recon/main/recon.schema.json",
  "version": 1,
  "rules": []
}
```

### Top-level fields

| Field | Type | Required | Value |
| --- | --- | --- | --- |
| `$schema` | String | No | JSON Schema URL used by editors. |
| `version` | Number | Yes | Must be `1`. |
| `rules` | Array of rules | Yes | Rules evaluated in array order. |

### Rule fields

| Field | Type | Required | Default | Behavior |
| --- | --- | --- | --- | --- |
| `id` | String | Yes | — | Unique lowercase words separated by hyphens. |
| `message` | String | Yes | — | Guidance printed when the rule finds changes. |
| `target` | String | Yes | — | One of the four change targets. |
| `include` | String array | No | All paths | Include paths matching any glob. |
| `exclude` | String array | No | None | Exclude paths matching any glob. |
| `name` | String array | No | All names | Include exact file names matching any value. |
| `excludeName` | String array | No | None | Exclude exact file names matching any value. |
| `extension` | String array | No | All extensions | Include paths ending in any extension. |
| `excludeExtension` | String array | No | None | Exclude paths ending in any extension. |
| `contentRegex` | String array | No | All content | Include lines matching any regular expression. |
| `excludeContentRegex` | String array | No | None | Exclude lines matching any regular expression. |
| `caseSensitive` | Boolean | No | `false` | Apply case-sensitive matching when `true`. |

### Matching semantics

1. A rule considers only changes selected by `target`.
2. Values within one field use OR semantics.
3. Different fields use AND semantics.
4. An exclusion removes a candidate that otherwise matches.
5. Missing inclusive fields match every candidate.
6. Matching is case-insensitive unless `caseSensitive` is `true`.
7. Path globs are matched against paths relative to the Git root.
8. Globs support `*`, `**`, and `?`.
9. A path pattern without wildcard characters matches one exact path.
10. Added line numbers refer to the resulting file.
11. Deleted line numbers refer to the original file.
12. A fully deleted text file appears once in `deleted-files` and once per line in `deleted-lines`.
13. Binary files participate in file rules but not line rules.

## Rule examples

Every example shows a CLI command followed by the equivalent complete
`recon.json` file.

### Report new TypeScript type declarations

CLI:

```sh
recon add \
  --id new-types \
  --message "Make sure the new type cannot be derived from the source of truth." \
  --target added-lines \
  --extension .ts \
  --extension .tsx \
  --content-regex '^\s*(?:export\s+)?(?:type|interface)\s+'
```

`recon.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/vestia-dev/recon/main/recon.schema.json",
  "version": 1,
  "rules": [
    {
      "id": "new-types",
      "message": "Make sure the new type cannot be derived from the source of truth.",
      "target": "added-lines",
      "extension": [".ts", ".tsx"],
      "contentRegex": ["^\\s*(?:export\\s+)?(?:type|interface)\\s+"]
    }
  ]
}
```

### Report files added under a directory

CLI:

```sh
recon add \
  --id no-generated-files \
  --message "Do not add files under generated/." \
  --target added-files \
  --include 'generated/**'
```

`recon.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/vestia-dev/recon/main/recon.schema.json",
  "version": 1,
  "rules": [
    {
      "id": "no-generated-files",
      "message": "Do not add files under generated/.",
      "target": "added-files",
      "include": ["generated/**"]
    }
  ]
}
```

### Report unapproved file names under a directory

CLI:

```sh
recon add \
  --id approved-schema-files \
  --message "Only X, Y, and Z may be added under schemas/." \
  --target added-files \
  --include 'schemas/**' \
  --exclude-name X \
  --exclude-name Y \
  --exclude-name Z
```

`recon.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/vestia-dev/recon/main/recon.schema.json",
  "version": 1,
  "rules": [
    {
      "id": "approved-schema-files",
      "message": "Only X, Y, and Z may be added under schemas/.",
      "target": "added-files",
      "include": ["schemas/**"],
      "excludeName": ["X", "Y", "Z"]
    }
  ]
}
```

### Report files added with an extension

CLI:

```sh
recon add \
  --id no-snapshots \
  --message "Do not add snapshot files." \
  --target added-files \
  --extension .snap
```

`recon.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/vestia-dev/recon/main/recon.schema.json",
  "version": 1,
  "rules": [
    {
      "id": "no-snapshots",
      "message": "Do not add snapshot files.",
      "target": "added-files",
      "extension": [".snap"]
    }
  ]
}
```

### Report any line added to one file

Omitting `--content-regex` makes every added line in the selected file match.

CLI:

```sh
recon add \
  --id immutable-generated-client \
  --message "Do not manually add lines to the generated client." \
  --target added-lines \
  --include src/generated/client.ts
```

`recon.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/vestia-dev/recon/main/recon.schema.json",
  "version": 1,
  "rules": [
    {
      "id": "immutable-generated-client",
      "message": "Do not manually add lines to the generated client.",
      "target": "added-lines",
      "include": ["src/generated/client.ts"]
    }
  ]
}
```

### Report deleted files

CLI:

```sh
recon add \
  --id preserve-migrations \
  --message "Migration files must not be deleted." \
  --target deleted-files \
  --include 'migrations/**'
```

`recon.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/vestia-dev/recon/main/recon.schema.json",
  "version": 1,
  "rules": [
    {
      "id": "preserve-migrations",
      "message": "Migration files must not be deleted.",
      "target": "deleted-files",
      "include": ["migrations/**"]
    }
  ]
}
```

### Report deleted lines matching content

CLI:

```sh
recon add \
  --id preserve-permission-checks \
  --message "Permission checks must not be removed." \
  --target deleted-lines \
  --include 'src/**' \
  --content-regex 'requirePermission'
```

`recon.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/vestia-dev/recon/main/recon.schema.json",
  "version": 1,
  "rules": [
    {
      "id": "preserve-permission-checks",
      "message": "Permission checks must not be removed.",
      "target": "deleted-lines",
      "include": ["src/**"],
      "contentRegex": ["requirePermission"]
    }
  ]
}
```

## Development

Development requires [Bun](https://bun.sh/).

```sh
bun install
bun run check
bun run build
./dist/recon --version
```

`bun run build` writes a standalone executable for the current platform to
`dist/recon`.

## Release

1. Set the version in `package.json`.
2. Run `bun run check`.
3. Run `bun run build:release`.
4. Create a GitHub Release tagged `v<version>`.
5. Upload every file from `dist/release`.
