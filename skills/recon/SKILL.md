---
name: recon
description: Use when working in a Git repository configured with Recon, or when asked to check current code changes against repository-defined advisory rules.
---

# Recon

Recon checks active Git changes against advisory rules stored in `recon.json`.

## Workflow

1. Make the requested code changes.
2. Run `recon check` before finishing.
3. Read every finding and inspect the reported files and lines.
4. Apply guidance that is relevant to the user's request. Recon findings are contextual advice, not automatic proof that the code is wrong.
5. Run `recon check` again after addressing findings.
6. Summarize any finding you intentionally did not address and why.

Do not remove, weaken, or bypass a Recon rule merely to clear a finding unless the user explicitly asks you to change the repository's rules.

## Useful commands

```sh
recon check                 # Check index, working tree, and untracked files against HEAD
recon check --staged        # Check only staged changes
recon check --base <ref>    # Check changes relative to a Git revision
recon check --json          # Emit structured findings
recon list                  # List configured rules
recon show <rule-id>        # Inspect one rule
recon get-docs-url          # Print documentation for the installed Recon version
```

Use `--strict` only when the exit code must indicate whether findings exist. Without it, findings are advisory and `recon check` exits successfully.

If `recon.json` is absent, do not create one unless the user asks to configure Recon.
