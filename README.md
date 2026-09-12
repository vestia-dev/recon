# Recon

Recon checks current Git changes against repository-owned advisory rules. It is
language-independent, reports guidance without blocking by default, and can be
compiled into a standalone executable with no Bun or Node.js requirement at
runtime.

## Build

Building Recon currently requires [Bun](https://bun.sh/):

```sh
bun run build
```

The standalone executable is written to `dist/recon`:

```sh
./dist/recon --help
```

During development, use `bun run recon -- <arguments>`.

## Get started

Run these commands inside a Git repository:

```sh
recon init
recon add \
  --id new-types \
  --message "Make sure the new type cannot be derived from the source of truth." \
  --target added-lines \
  --extension .ts \
  --extension .tsx \
  --content-regex '^\\s*(?:export\\s+)?(?:type|interface)\\s+'
recon
```

Recon stores rules in `recon.json` at the Git root. `recon add` also creates the
file when it does not exist.

## Commands

```text
recon [check] [--staged | --base <ref>] [--strict] [--json]
recon init
recon add --id <id> --message <message> --target <target> [match flags]
recon list
recon show <rule-id>
recon remove <rule-id>
```

Running `recon` is equivalent to `recon check`. It compares staged, unstaged,
and untracked changes with `HEAD`; `--staged` checks only the index, while
`--base <ref>` compares all current work with another Git revision.

The available targets are `added-files`, `added-lines`, `deleted-files`, and
`deleted-lines`. A deleted file is available both as one `deleted-files` change
and as its individual `deleted-lines` changes.

Use `--strict` to exit with status 1 when guidance is found, or `--json` for
structured output. Without `--strict`, guidance exits successfully.

Every command accepts `--config <path>` to use a file other than `recon.json`.

## Matching

`recon add` accepts these repeatable match flags:

| Flag | Meaning |
| --- | --- |
| `--include <glob>` | Include matching repository-relative paths |
| `--exclude <glob>` | Exclude matching paths |
| `--name <name>` | Include exact file names |
| `--exclude-name <name>` | Exclude exact file names |
| `--extension <extension>` | Include paths ending in an extension |
| `--exclude-extension <extension>` | Exclude paths ending in an extension |
| `--content-regex <regex>` | Include changed lines matching a regular expression |
| `--exclude-content-regex <regex>` | Exclude changed lines matching a regular expression |
| `--case-sensitive` | Make every matcher in the rule case-sensitive |

Repeated values for one field use OR semantics, different fields use AND
semantics, and exclusions remove otherwise matching changes. Content matchers
are valid only for line targets. Matching is case-insensitive by default.

Globs support `*`, `**`, and `?`. A pattern without wildcard characters is an
exact repository-relative path.

### No new files in a directory

```sh
recon add \
  --id no-generated-files \
  --message "Do not add files under generated/." \
  --target added-files \
  --include 'generated/**'
```

### Only approved file names in a directory

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

### No new files with an extension

```sh
recon add \
  --id no-snapshots \
  --message "Do not add snapshot files." \
  --target added-files \
  --extension .snap
```

### No lines added to a file

```sh
recon add \
  --id immutable-generated-client \
  --message "Do not manually add lines to the generated client." \
  --target added-lines \
  --include src/generated/client.ts
```

### Preserve files and lines

```sh
recon add \
  --id preserve-migrations \
  --message "Migration files must not be deleted." \
  --target deleted-files \
  --include 'migrations/**'

recon add \
  --id preserve-permission-checks \
  --message "Permission checks must not be removed." \
  --target deleted-lines \
  --include 'src/**' \
  --content-regex 'requirePermission'
```

## Requirements

The compiled Recon executable has no language runtime dependency. Git must be
installed and the command must run inside a Git repository.
