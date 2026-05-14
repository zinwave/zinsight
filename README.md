# zinsight

[![npm version](https://img.shields.io/npm/v/zinsight.svg)](https://www.npmjs.com/package/zinsight)
[![npm downloads](https://img.shields.io/npm/dw/zinsight.svg)](https://www.npmjs.com/package/zinsight)
[![license](https://img.shields.io/npm/l/zinsight.svg)](LICENSE)
[![Node](https://img.shields.io/node/v/zinsight.svg)](package.json)

> The README your AI agent should have written.
> Generate a complete `ARCHITECTURE.md` for any JS/TS codebase. **No AI. No signup. No config.**

```bash
npx zinsight
```

That's the whole setup. ~5 seconds later, your repo has an `ARCHITECTURE.md` that explains itself.

---

## Why this exists

You (or your AI agent) shipped a working app over weeks of prompts. It works. But six months later you can't remember:

- What does this codebase actually do?
- Where does authentication happen?
- Which files are riskiest to change?
- What conventions did past-you (or the agent) follow?
- Where do I start reading?

zinsight answers those questions in one command, by **statically analysing the code** — no LLM, no API keys, no source code uploaded anywhere.

## What you get

A single `ARCHITECTURE.md` with sections like:

- **In one paragraph** — what the app actually does, derived from real code
- **At a Glance** — mini diagram of inbound/outbound traffic + state
- **Core Concepts** — domain glossary (entities, services, roles)
- **Walking Through One Request** — happy-path trace of a representative endpoint
- **Where State Lives** — DB / cache / KVS / cookies / env / FS
- **Conventions** — implicit rules with evidence ("All routes have guards or @Public")
- **External Contracts** — what we call out, who calls in, with what auth
- **Lifecycle** — boot, request flow, install/uninstall, webhooks, cron
- **How to Get Productive** — scenario-based reading paths ("Understand the request lifecycle in 15 min")
- **Where to Look** — concept-to-file map ("Auth? Database? AI? Config?")
- **What This Repo Isn't** — anti-purpose statements
- **Frontend at a Glance** — React Router routes, components, state stores, styling
- **Hotspots** — most-changed files (last 180 days, from git log)
- **Required vs Optional config** — env vars with risk-if-missing hints
- Plus: data model ER diagram, full route list, modules table, tech stack, dependency graph

### Sample output (excerpt)

For a NestJS backend with 19,693 lines of code:

> **Zinboard Api** is a **backend API service** built with **Express, NestJS** that enables users to conduct 1:1 meetings, collect and manage feedback, track goals, manage teams, manage team members, leverage AI-powered insights, and track decisions.
>
> The codebase follows a **modular, controller-service, guard-protected, schema-driven** architecture — each feature is a self-contained module with clear separation between HTTP handling (controllers), business logic (services), and data access (schemas).

```
## Walking Through One Request

The most-trafficked path is GET /oneonones/:id. Picked from the
oneonones.controller.ts (19 endpoints in that file) — typical read-by-id
path through the system.

1. Client sends GET /oneonones/:id
2. Middleware runs: SessionAuthMiddleware, RequestIdMiddleware, main.ts
3. Guards check access: AuthenticatedGuard → RolesGuard → OrgGuard
4. Controller get() is invoked — src/oneonones/oneonones.controller.ts
5. Service get() runs business logic — src/oneonones/oneonones.service.ts
6. Reads/writes MONGODB — scoped query against `oneonones` collection
7. Response returned to client (JSON)
```

```
## Where to Look

| If you want to change...           | Look in                                                   |
|------------------------------------|-----------------------------------------------------------|
| Authentication / Login             | src/auth/auth.service.ts, src/auth/auth.sessionMiddleware |
| Authorization / Roles              | src/auth/guard/roles.guard.ts                             |
| Database schemas                   | src/schemas/                                              |
| AI / LLM integration               | src/ai/ai.service.ts, src/ai/prompt.ts                    |
| Email / Notifications              | src/integrations/slack/notification.service.ts            |
| Webhooks                           | src/integrations/zoom/zoom.controller.ts                  |
```

## Quick start

```bash
# Run on the current directory
npx zinsight

# Or specify a directory
npx zinsight ./my-project

# Custom output path
npx zinsight --output docs/ARCHITECTURE.md
```

That's it. No install. No login. No keys.

## How does it compare?

| | zinsight | Hand-written docs | LLM-based tools (CodeRabbit, etc.) | IDE features |
|---|---|---|---|---|
| **Setup time** | 5 seconds | hours/days | sign-up, API keys, config | already in editor |
| **Cost** | free | engineer time | $20-200/mo | varies |
| **Sends source code anywhere** | ❌ no | n/a | ✅ yes | varies |
| **Deterministic output** | ✅ same input = same output | n/a | ❌ model drift | varies |
| **Stays current with code** | ✅ regenerate any time | ❌ rots immediately | ✅ on each PR | n/a |
| **Works offline / air-gapped** | ✅ yes | n/a | ❌ no | varies |
| **Generates Mermaid diagrams** | ✅ yes | maybe | sometimes | rarely |
| **Output format** | Single ARCHITECTURE.md | varies | comments, dashboards | inline |

The **"no AI, no signup"** part is intentional — zinsight is built for environments where LLM tools are blocked (banking, healthcare, defense), and for the case where you just want to understand a codebase without paying anyone.

## Use cases

**Inheriting a vibe-coded repo** · You (or your AI agent) built a working app. Now you need to explain it to a new contributor — or future you.

**Open-source contributors** · A new contributor lands in your project. `ARCHITECTURE.md` orients them in 5 minutes instead of 5 hours.

**Pre-merge review** · Drop the GitHub Action in. Every PR gets an updated `ARCHITECTURE.md` automatically.

**Security / compliance review** · Map every external service, every state surface, every env var, every auth surface — with file paths.

**Air-gapped / regulated environments** · No data ever leaves your machine. Pure local static analysis.

## CLI options

```
Usage: zinsight [options] [directory]

Arguments:
  directory                  Project root directory (default: current)

Options:
  -V, --version              Output the version number
  -o, --output <path>        Output file path (default: ARCHITECTURE.md)
  -r, --root <path>          Project root directory (alias for [directory])
  -h, --help                 Show help
```

## GitHub Action

Drop this in any repo to keep `ARCHITECTURE.md` automatically up to date on every push to `main`:

```yaml
# .github/workflows/architecture.yml
name: Architecture Docs

on:
  push:
    branches: [main]

jobs:
  zinsight:
    runs-on: ubuntu-latest
    permissions:
      contents: write    # required if commit: true
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # full history → richer Hotspots section
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: zinboard/zinsight-action@v1
        with:
          output: ARCHITECTURE.md
          commit: true
```

See [GITHUB_ACTION.md](GITHUB_ACTION.md) for full setup, advanced options, and PR-comment mode.

## What it analyses

zinsight currently understands JavaScript and TypeScript codebases (`.js`, `.jsx`, `.ts`, `.tsx`). It detects:

- **Frameworks**: NestJS, Express, Fastify, Koa, Hono, Polka, Restify, React, Next.js, Remix, Vue, Svelte, Vite
- **Databases**: MongoDB (Mongoose), PostgreSQL, MySQL, SQLite, Redis, DynamoDB
- **Routers**: Express-style, NestJS decorators, Fastify route(), React Router, Next App Router, Next Pages Router
- **State stores**: Zustand, Redux Toolkit, React Context, Jotai, Recoil, MobX
- **Styling**: Tailwind, styled-components, Emotion, CSS Modules, SCSS, Vanilla Extract, Stitches
- **External services**: Stripe, Slack, Zoom, GitHub, OpenAI, Anthropic, Google, Atlassian, Sentry, AWS, Firebase, and more
- **Deployment**: Dockerfile, docker-compose, GitHub Actions, GitLab CI, Kubernetes manifests, Vercel/Netlify/Render configs
- **Testing**: Jest, Vitest, Mocha, Cypress, Playwright

Python, Go, and Rust support is on the roadmap.

## FAQ

**Does it send my code anywhere?**
No. zinsight is a CLI tool that runs entirely on your machine. No network calls, no telemetry, no signup, no API keys. The only thing it touches outside your repo is git (to read commit history for the Hotspots section).

**Why no AI?**
Three reasons: (1) determinism — same input always produces the same output; (2) speed — runs in seconds not minutes; (3) it works in environments where LLM tools are blocked or impossible (regulated industries, air-gapped networks, on-call from a plane).

**Can I add an AI section?**
Not built in by default — see "Why no AI" above. We may add an opt-in `--story` flag in a future release that uses your own API key (BYOL) to generate a narrative paragraph. Roadmap, not committed.

**Does it work on monorepos?**
Yes. zinsight detects nested `package.json` files in `static/`, `apps/`, `packages/`, `frontend/`, `client/`, `web/`, `ui/` (one level deep). Run it at the monorepo root.

**My repo isn't JavaScript / TypeScript — does this work?**
Not yet. JS/TS only at the moment. Python, Go, and Rust are on the roadmap.

**Will it overwrite my hand-written `ARCHITECTURE.md`?**
By default, yes — it writes to `ARCHITECTURE.md`. Use `--output docs/zinsight.md` (or any other path) to keep them separate.

**How does the Hotspots section know about git history?**
It runs `git log --since=180.days.ago --name-only`. If you're in a fresh clone with shallow history (CI default), set `fetch-depth: 0` on the checkout step to get the full picture.

**Why does it skip some routes my framework supports?**
zinsight uses AST patterns to detect routes. If your framework uses an unusual registration style (custom decorators, dynamic mounting), some routes may be missed. Open an issue with a small reproduction and we'll add detection.

**The Conventions section says we follow X. We don't follow X consistently.**
Conventions are detected based on majority pattern + listed exceptions. If 70% of files follow a pattern and 30% don't, the rule is reported with a note about the exceptions. Use this as a "should we standardize?" prompt rather than a strict rule.

**Can I ignore certain folders?**
zinsight respects `.gitignore` automatically. To ignore additional paths beyond gitignore, the recommended workaround is to run zinsight against a more specific subdirectory (e.g., `npx zinsight src/`).

**Where can I see example outputs?**
We're putting together an `examples/` directory with generated docs for popular open-source projects. Coming soon. In the meantime, run it on your own repo — that's the best demo.

## Contributing

PRs welcome. Best ways to help:

- Open an issue with a repo that produces a bad / unhelpful doc (with a small repro if possible)
- Add detection for a framework / library / pattern you use that zinsight misses
- Add a language analyzer (Python, Go, Rust)
- Improve the markdown rendering for any section

Local dev:

```bash
git clone https://github.com/zinboard/zinsight.git
cd zinsight
npm install
npm run build
node dist/cli/index.js --root /path/to/some/repo
```

## License

MIT — see [LICENSE](LICENSE).

---

Built by [Dhanush Shetty](https://github.com/dhanushshetty) at [Zinwave Innovations](https://zinboard.com).
If zinsight saves you time, [a star on GitHub](https://github.com/zinboard/zinsight) helps others find it.
