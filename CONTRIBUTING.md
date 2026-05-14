# Contributing to zinsight

Thanks for opening this file — the project is open to outside contributors and
this doc covers everything you need to make a useful PR.

## Quick start

```bash
git clone https://github.com/zinwave/zinsight.git
cd zinsight
npm install
npm run build         # tsc → dist/
npm test              # jest
npm run lint          # eslint src
```

Run zinsight against a local repo while developing:

```bash
node dist/cli/index.js <path-to-repo>
```

Or with hot-reload:

```bash
npm run dev           # tsc --watch in one terminal
node dist/cli/index.js <path-to-repo>   # in another
```

## What kind of contributions help

Roughly in order of impact:

1. **Bug reports with a reproducible test case.** A `npm test` failure is the
   strongest signal — open an issue with the command you ran and the diff
   between expected and actual output.
2. **New language / framework detectors** in `src/detectors/`. The hardest
   work is signal stability across real codebases, not just toy fixtures.
3. **Better Mermaid layouts** for the architecture diagram. Big repos
   currently produce unreadable graphs.
4. **Doc improvements** — README clarity, ARCHITECTURE.md quality, example
   outputs.

Out of scope (for now):

- LLM-based analysis. The whole point of zinsight is *no LLM, no signup,
  no upload* — keep static analysis as the core.
- Breaking changes to the CLI surface without a deprecation path.

## How a good PR looks

- One focused change per PR. Several unrelated commits in one PR usually
  means at least one of them needs a separate discussion.
- New behaviour comes with a test. New detectors come with a fixture
  under `examples/` and a snapshot.
- `npm test`, `npm run lint`, `npm run build` all pass locally.
- Commit messages describe the *why*, not the *what* — the diff already
  shows what changed.

## Reporting bugs

Use the GitHub issue tracker. The bug-report template asks for the input
codebase characteristics (language mix, size, build system) — those
matter for static analysis more than for typical apps. Don't worry if
you can't share the codebase itself; the structural details usually
narrow it down.

## Reporting security issues

**Do not open a public issue.** See [SECURITY.md](SECURITY.md) for the
disclosure flow.

## License

By submitting a PR you agree your contributions are licensed under the
project's [MIT License](LICENSE).
