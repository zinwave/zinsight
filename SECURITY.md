# Security policy

## Reporting a vulnerability

**Please do not open a public GitHub issue.** zinsight runs locally as a
CLI, so the typical attack surfaces are:

- Reading malicious files in a target codebase (e.g., a crafted source
  file that escapes the AST parser and executes during analysis).
- Generating malicious output (e.g., an injection into the produced
  `ARCHITECTURE.md` that does something dangerous when rendered).
- Dependency vulnerabilities in our `package.json`.

If you find any of the above, email **contact.zinwave@gmail.com** with:

1. A clear description of the vulnerability and its impact.
2. A minimal reproducer — a tarball or git ref of the input that
   triggers it, plus the exact CLI command.
3. Any suggested mitigation.

You can expect:

- An acknowledgement within 48 hours.
- A status update within 7 days, including a target fix date.
- Credit in the release notes once the fix is published (unless you
  prefer to remain anonymous).

## Supported versions

zinsight follows semver. Only the latest minor version receives security
fixes. Older versions are expected to upgrade. Until 1.0.0, the
"supported" line is `0.x` where `x` is the highest published minor.

| Version  | Status     |
| -------- | ---------- |
| 0.10.x   | Supported  |
| < 0.10   | EOL        |

## Out of scope

- Bugs that aren't security-impacting (use the regular issue tracker).
- Vulnerabilities in dependencies that the upstream project hasn't
  acknowledged — please report those upstream first.
- Social-engineering reports against the maintainers.
