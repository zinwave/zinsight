# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-05-24

Hardening release. Closes every P0 trust/safety issue and most P0.5 / P1 correctness issues surfaced after running zinsight across a 48-repo corpus (mixed NestJS, Express, React/Vite, AWS Lambda, PHP/Symfony, Terraform). No breaking changes to the CLI surface or document shape; one new flag, one new banner.

### Security

- **Redact secrets from env-var defaults.** Hardcoded `||`-fallback values
  for variables named `*SECRET*`, `*PASSWORD*`, `*API_KEY*`, `*TOKEN*`,
  `*PRIVATE_KEY*`, `*CREDENTIALS*`, `*DSN*`, `*CONNECTION_STRING*` are now
  rendered as `<redacted>` in the generated document. Also redacts values
  that embed URL credentials (`scheme://user:pass@host`), known credential
  token shapes (`sk-`, `ghp_`, `xox[bp]-`, AWS `AKIA…`), and long opaque
  base64-ish strings. Previously these could leak the literal value of
  e.g. a `MONGO_URI` fallback to anyone reading `ARCHITECTURE.md`.

### Added

- **`--name <name>` CLI flag** to override the project name in the
  generated document (useful when `package.json` `name` doesn't match the
  folder name, or when zinsight descends into `code/`/`src/`).
- **Auto-resolve project root.** When the cwd has no analyzable code but
  a single obvious child does (`code/`, `src/`, `app/`, `server/`,
  `backend/`, `frontend/`, `client/`, `ui/`, `web/`), zinsight descends
  one level. Common for AWS SAM repos that put NestJS code under `code/`.
  The CLI logs `ℹ Descended into project root: ./<dir>` so the user knows.
- **Multi-language detection.** Identifies PHP/Composer,
  Python/`pyproject.toml`, Go/`go.mod`, Java/Maven, Ruby/Gemfile,
  Rust/Cargo, and Terraform projects. zinsight still only parses JS/TS,
  but it now refuses to mis-label the project as Node.js. The CLI shows a
  yellow warning, and a `> ⚠️ Detected language: …` banner is emitted at
  the top of the generated `ARCHITECTURE.md`.
- **`ProjectKind` discriminator** (`cli`, `library`, `static-site`,
  `frontend`, `backend-server`, `lambda`, `fullstack`) computed from
  `package.json#bin`, SAM/Serverless manifests, frontend framework
  presence, and route detection. Drives section gating so e.g. CLIs
  don't get request-lifecycle sequence diagrams.
- **Capabilities truth-set.** Single source of truth that both the
  positive "Core Capabilities" section and the negative "What This Repo
  Isn't" section read from. Eliminates same-doc contradictions like
  "Payment processing — 4 endpoints" appearing alongside "No payment
  processing".
- **Operational Code callout.** `scripts/`, `migrations/`, `seeds/`,
  `fixtures/`, `tools/`, `bin/`, `dev-docker-related/`, etc. are now
  rendered under a separate `### Operational Code` section below the
  main `## Modules` table instead of being listed as feature modules.

### Changed

- **External services: AST-only detection.** The loose
  `https?://[…]+` text regex over file contents has been removed. Only
  `fetch()`, `axios.{verb}()`, `axios({url, method})`,
  `axios.create({baseURL})`, and equivalent HTTP-client call sites are
  recorded. Added a denylist of image CDNs (pinimg, unsplash, freepik,
  vecteezy, meesho, pngtree, iconscout, etc.), social/share hosts
  (instagram, youtube, x.com, wa.me), and tooling/doc hosts (vitejs.dev,
  cra.link, mongodb.com/docs, nestjs.com, etc.). Per-file 18-host
  outbound contracts from React UIs (image `src=…` URLs) are gone.
- **Where to Look: segment-aware matching, AST-scoped content.** Path
  patterns are word-anchored so `/policy/` no longer matches
  `privacyPolicy.tsx`. Content patterns now run against text with string
  literals, regex bodies, and comments stripped — zinsight's own
  detection-regex source can no longer self-match. Minimum match
  thresholds (≥1 file with strong content match, OR ≥2 distinct
  patterns) suppress one-off coincidences. Concepts can declare
  `requiredKind` to gate themselves (e.g. "Database schemas" only fires
  on backend kinds).
- **AI / LLM detector expansion.** Now recognises OpenRouter,
  Anthropic (`@anthropic-ai/sdk`), Google Gemini, Cohere, Mistral, Groq,
  Together AI, Hugging Face, and Ollama in addition to OpenAI.
- **State Map gated on declared dependencies.** Redis / cookie-session
  detection now requires the corresponding `package.json` dependency
  (`redis`/`ioredis`/`cookie-parser`/`express-session`). Previously
  zinsight's own self-doc claimed "Redis" and "Cookies/sessions" because
  its detection-regex source contained those literal strings.
- **Tech stack honours detected language.** Runtime label
  (Node.js / Bun / Deno / PHP / Python / Go / Rust / JVM / Ruby /
  Terraform) tracks the project language. For non-JS/TS projects, the
  `package.json` dependency analysis is skipped entirely instead of
  claiming "built with NestJS" on a PHP/Symfony repo.
- **React Router nested-route paths preserved.** The JSX visitor walks
  up enclosing `<Route path="…">` ancestors and prefixes child paths.
  Routes like `dashboards`/`goals` nested under `<Route path="/app">`
  now correctly render as `/app/dashboards`/`/app/goals`. Both legacy
  `component={X}` and v6 `element={<X/>}` syntaxes are handled.
- **Scheduled jobs no longer false-positive on `setInterval`.**
  Detection skips `.tsx`/`.jsx` files (where `setInterval` is almost
  always UI polling) and requires an explicit `@Cron(…)` decorator or
  a known scheduler library import (`node-cron`, `@nestjs/schedule`).
- **Module purpose from folder README.** When a module has its own
  README and the name-based heuristic doesn't have a label, the first
  paragraph of the README becomes the module's one-liner. Also added a
  name-based table for common module names (`analyzer`, `parser`,
  `generator`, `worker`, `queue`, `webhook`, `scheduler`, `middleware`,
  etc.) so the generic "Feature module — N files, M public exports"
  fallback rarely fires now.
- **Common Tasks suggestions verified.** "Add an environment variable"
  scores files by env-var contract count, prefers config/main/bootstrap
  files, and explicitly excludes tooling configs (`eslint.config.*`,
  `vite.config.*`, `prettier.config.*`, etc.). "Integrate a new
  external API" verifies the suggested file actually exists in the
  graph.
- **Key Files: importance-based fallback.** After the seven hardcoded
  categories fill, additional files are admitted by importance score
  (`importedBy.length * sqrt(loc)`). Files whose names don't include
  `service|schema|controller|guard|util` but are central to the codebase
  (zinsight's own `analyzer/parser.ts`, `routes.ts`, `database.ts`) now
  appear in Key Files instead of being silently dropped.
- **Anti-purposes read from the capabilities truth-set.** No more
  contradictions with "Core Capabilities". Also: the unconditional
  "Single-region deployment" line is now only emitted for cloud-deployed
  kinds (backend-server / lambda / fullstack); never for CLIs,
  libraries, or static sites.
- **Project name disambiguation.** When zinsight descends into a generic
  subdir like `code/`, the title falls back to the parent folder name
  rather than the basename of the resolved root. `caterkart/mealmate`
  now correctly titles "mealmate" instead of "caterkart".
- **App-type label aware of `ProjectKind`.** AWS Lambda services are
  labelled "AWS Lambda service" instead of "backend API service".
  Libraries get "library / package"; static sites get "static site".

### Fixed

- **Empty `## Modules` table and degenerate `## Architecture` diagram.**
  Tiny repos used to print a `flowchart TB` containing only the
  `CLIENT` node, plus a Modules table with a header and zero rows. Both
  sections (and their TOC entries) are now suppressed when they would
  render empty.
- **"Walking Through One Request" no longer emitted for trivial repos.**
  Now requires ≥3 routes, OR a substantive picked handler (delegates to
  a service file, OR has ≥20 LOC in the controller). No more 6-step
  canned walkthroughs of `GET /` hello-worlds.
- **Stub `package.json` no longer fools language detection.** When a
  repo has both `composer.json` and `package.json` (cimpress
  `mcpcommunicator` pattern, where `package.json` exists only for
  serverless tooling), the manifest with substantial production
  `dependencies` wins. The repo is correctly identified as PHP.
- **`(root)` synthetic module no longer leaks into "Core Capabilities".**
  Files at the repo root were causing entries like "(Root) management"
  to show up in the capabilities list.
- **Tooling-config files no longer suggested as env-var entry points.**
  `eslint.config.mjs` was being recommended as "where to add an
  environment variable" purely because it contained
  `process.env.NODE_ENV`. The new scorer demotes tooling configs and
  prefers real bootstrap/config files.

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

[Unreleased]: https://github.com/zinwave/zinsight/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/zinwave/zinsight/releases/tag/v1.1.0
[1.0.0]: https://github.com/zinwave/zinsight/releases/tag/v1.0.0
[0.10.0]: https://github.com/zinwave/zinsight/releases/tag/v0.10.0
