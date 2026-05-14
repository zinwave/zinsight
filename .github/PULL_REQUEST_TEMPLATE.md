## What this changes

Brief description of the change. One sentence is usually enough.

## Why

The motivation — what problem this solves, or what new capability it
adds. Skip if the title already makes this obvious.

## How

Anything non-obvious about the approach. Trade-offs you considered.
Alternatives you rejected.

## Testing

- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` produces a working `dist/`
- [ ] Ran `node dist/cli/index.js` against at least one real codebase to
  confirm output is sensible
- [ ] Added or updated tests for the change (for behaviour changes)

## Out of scope

If reviewers might wonder "why didn't you also fix X" — note it here.

## Checklist

- [ ] Single focused change (split into separate PRs if not)
- [ ] Commit messages describe *why* the change is needed
- [ ] No unrelated formatting / lint churn
- [ ] Updated CHANGELOG.md under `[Unreleased]` if user-visible
