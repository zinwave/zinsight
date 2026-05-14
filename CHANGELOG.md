# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-05-14

First stable release. The public CLI surface (`npx zinsight [path] [--output …]`) and the generated `ARCHITECTURE.md` shape are now committed to — breaking changes from here on will go in a `2.x` line, never silently.

### Added
- Open-source contributor docs: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY.
- GitHub issue + PR templates under `.github/`.
- `.editorconfig` for consistent editor settings.
- README FAQ entry explaining the Socket.dev capability flags.

### Changed
- Fixed npm page repository link (was pointing at the wrong GitHub org).
- Replaced runtime dep `glob` with `fast-glob`. `glob@10` pulled in
  `foreground-child` → `cross-spawn` → `child_process`, which Socket
  flags as "Shell access" on the published package. `fast-glob` is
  pure JS (deps: `@nodelib/fs.*` + `glob-parent` + `merge2` +
  `micromatch`) and provides equivalent pattern semantics — `nodir`
  becomes `onlyFiles`; everything else stays the same. Verified by
  running zinsight against itself before and after.

## [0.10.0] - earlier

Initial publicly-documented release on npm. Static analysis pipeline for
JS/TS codebases producing `ARCHITECTURE.md` with Mermaid diagrams, API
endpoint extraction, database schema detection, external integration
mapping, and code-health signals.

[Unreleased]: https://github.com/zinwave/zinsight/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/zinwave/zinsight/releases/tag/v1.0.0
[0.10.0]: https://github.com/zinwave/zinsight/releases/tag/v0.10.0
