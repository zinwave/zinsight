# Zinsight GitHub Action

Auto-generate `ARCHITECTURE.md` on every push, pull request, or schedule. No AI, no signup, no source code uploaded — same as the CLI.

## Quick start

Drop this in `.github/workflows/architecture.yml`:

```yaml
name: Architecture Docs

on:
  push:
    branches: [main]

jobs:
  zinsight:
    runs-on: ubuntu-latest
    permissions:
      contents: write   # required when commit: true
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # full git history → richer Hotspots section
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: zinboard/zinsight@v1
        with:
          output: ARCHITECTURE.md
          commit: true
```

That's it. After the first run, `ARCHITECTURE.md` lives at the repo root and updates itself on every push to `main`.

## Common recipes

### Just regenerate the doc — never commit

Useful if you want to inspect the doc as a build artifact instead of committing it.

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: 20 }
- uses: zinboard/zinsight@v1
- uses: actions/upload-artifact@v4
  with:
    name: architecture
    path: ARCHITECTURE.md
```

### Comment on every pull request

Posts an orientation summary as a PR comment whenever the architecture has materially changed.

```yaml
on:
  pull_request:
    branches: [main]

jobs:
  zinsight:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write   # required for pr-comment: true
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: zinboard/zinsight@v1
        with:
          pr-comment: true
```

### Custom output location

```yaml
- uses: zinboard/zinsight@v1
  with:
    output: docs/architecture/index.md
    commit: true
```

### Pin a specific zinsight version

By default the action runs `zinsight@latest`. Pin it for deterministic output:

```yaml
- uses: zinboard/zinsight@v1
  with:
    version: '0.10.0'
```

### Monorepo: generate per-package docs

```yaml
strategy:
  matrix:
    pkg: [api, web, worker]
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 20 }
  - uses: zinboard/zinsight@v1
    with:
      root: packages/${{ matrix.pkg }}
      output: packages/${{ matrix.pkg }}/ARCHITECTURE.md
      commit: true
```

### Scheduled regeneration

Refresh weekly — keeps the doc current even on quiet branches.

```yaml
on:
  schedule:
    - cron: '0 6 * * 1'   # Mondays at 06:00 UTC

jobs:
  zinsight:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: zinboard/zinsight@v1
        with:
          commit: true
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `output` | `ARCHITECTURE.md` | Output path for the generated markdown. |
| `root` | `.` | Project root to analyse. |
| `version` | `latest` | Pin a specific zinsight npm version. |
| `commit` | `false` | Commit and push the doc when it changes. |
| `commit-message` | `docs: regenerate ARCHITECTURE.md [zinsight]` | Commit message used when `commit: true`. |
| `commit-user-name` | `github-actions[bot]` | Git `user.name` for the commit. |
| `commit-user-email` | `github-actions[bot]@users.noreply.github.com` | Git `user.email` for the commit. |
| `pr-comment` | `false` | Post a summary comment on the triggering PR. |
| `fail-on-no-output` | `true` | Fail the job if zinsight produces no output. |

## Outputs

| Output | Description |
|--------|-------------|
| `output-path` | Absolute path to the generated markdown file. |
| `changed` | `"true"` if the generated doc differs from the previous version on disk. |

Use them in subsequent steps:

```yaml
- id: docs
  uses: zinboard/zinsight@v1

- if: steps.docs.outputs.changed == 'true'
  run: echo "Architecture has changed since last commit!"
```

## Permissions cheat-sheet

| Setting | Permissions needed |
|---------|--------------------|
| Read-only run, no commit, no PR comment | `contents: read` (default) |
| `commit: true` | `contents: write` |
| `pr-comment: true` | `pull-requests: write` |

When you set both, list both — GitHub doesn't merge defaults with explicit overrides.

```yaml
permissions:
  contents: write
  pull-requests: write
```

## Troubleshooting

**The Hotspots section is missing or empty.**
You're likely on a shallow git clone (the default for `actions/checkout`). Add `fetch-depth: 0`:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
```

**The action fails with "Permission denied" when committing.**
Add `permissions: contents: write` at the job level. GitHub blocks commits from default-token jobs unless permissions are explicit.

**The PR comment isn't posted.**
Two requirements: (1) `permissions: pull-requests: write`, (2) the workflow must run on `pull_request`, not on `push` or `workflow_dispatch`.

**zinsight isn't picking up my framework / library.**
Open an issue on [zinboard/zinsight](https://github.com/zinboard/zinsight) with a small reproduction. We add detection patterns based on real-world examples.

**I want to regenerate without committing — only fail the build if the doc has drifted.**
That's a doc-drift gate. Use `commit: false` and a follow-up step:

```yaml
- id: docs
  uses: zinboard/zinsight@v1
- if: steps.docs.outputs.changed == 'true'
  run: |
    echo "::error::ARCHITECTURE.md is out of date. Run \`npx zinsight\` locally and commit."
    exit 1
```

## License

MIT — same as zinsight itself.
