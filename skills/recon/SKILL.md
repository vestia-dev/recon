---
name: recon
description: Command reference for using Recon to check Git changes against repository-defined advisory rules.
---

# Recon

Recon checks active Git changes against advisory rules stored in `recon.json`.

## Check changes

```sh
recon check                 # Check index, working tree, and untracked files against HEAD
recon check --staged        # Check only staged changes
recon check --base <ref>    # Check changes relative to a Git revision
recon check --json          # Emit structured findings
recon check --strict        # Exit with status 1 when findings exist
```

`--staged` and `--base` cannot be used together. Use `--config <path>` to read a
configuration other than `recon.json` at the Git root.

Without `--strict`, findings are advisory and the command exits with status 0.

## Rule design

Recon rules are review prompts, not lint rules or definitive prohibitions. They
should identify code worth a reviewer's attention, even when a potential issue
cannot be proven statically.

When proposing rules:

- Translate semantic antipatterns into practical textual heuristics where possible.
- Prefer focused patterns whose findings raise a concrete, useful review question.
- Do not reject a rule solely because it may produce false positives or cannot
  prove a violation.
- Phrase findings as questions or guidance, such as “Review whether…”.
- Narrow the scope when doing so meaningfully reduces noise.
- Avoid heuristics only when irrelevant findings are likely to outweigh their
  review value.
- Leave the final judgment to the reviewer.

## Inspect and manage rules

```sh
recon init                  # Create an empty recon.json
recon list                  # List configured rules
recon show <rule-id>        # Print one rule as JSON
recon remove <rule-id>      # Remove one rule
recon add [options]         # Add a rule
```

Use the documentation from `recon get-docs-url` for the complete set of rule
matching options.

## Documentation and version

```sh
recon get-docs-url          # Print documentation for the installed version
recon --version             # Print the installed version
```
