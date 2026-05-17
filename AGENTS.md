# Agent instructions for Glasshouse

Glasshouse is intended to be an open-source local browser control plane for AI agents.

Read `PRD.md` before implementing anything. The PRD is the source of truth.

Guidelines:

- Preserve user changes. Do not reset/rebase without explicit permission.
- Keep the project framework-neutral; do not depend on Hermes internals.
- Prefer TypeScript and small modules.
- Default tests must not require a real browser.
- Browser integration tests should be opt-in via `GLASS_INTEGRATION=1`.
- All machine-facing commands should have stable `--json` output.
- Profile selection via `GLASS_PROFILE` is a first-class requirement.
