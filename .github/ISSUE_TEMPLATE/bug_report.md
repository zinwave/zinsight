---
name: Bug report
about: Something zinsight produced is wrong, broken, or surprising
title: ''
labels: bug
assignees: ''
---

## What happened

A clear description of the bug.

## Expected behaviour

What you thought zinsight would produce or do.

## Reproduction

```bash
# Exact command you ran:
npx zinsight <args>
```

If the bug is in the generated `ARCHITECTURE.md`, paste the relevant
section here (redact anything proprietary first):

```markdown
<paste>
```

## About the codebase you ran it against

zinsight's output is sensitive to the shape of the input. Please tell us:

- Languages and approximate file count (e.g., "TypeScript + Python,
  ~400 files")
- Build system (npm / pnpm / yarn / cargo / poetry / etc.)
- Monorepo or single package
- Any unusual setup (workspaces, generated files, custom transpilers)

## Environment

- zinsight version: <output of `npx zinsight --version`>
- Node version: <output of `node --version`>
- OS: macOS / Linux / Windows

## Additional context

Anything else that might help — screenshots of the rendered Mermaid
diagram, console errors, etc.
