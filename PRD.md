# Glasshouse PRD

## Summary

Glasshouse is an open-source local browser control plane for AI agents. It gives many agents a shared, debuggable way to use named persistent Chrome profiles through a CLI, local API, and MCP server.

The core promise:

> Give every agent a named, persistent, policy-controlled browser profile — without each agent inventing its own Chrome/Playwright mess.

Glasshouse should not be tied to Hermes. Hermes, Codex, Claude Code, OpenCode, AgentPit, cron scripts, and arbitrary shell tools should all be able to use it.

## Non-goals

- Do not build another browser-using AI agent brain.
- Do not replace Playwright or Chrome DevTools Protocol.
- Do not require a cloud browser service for local workflows.
- Do not make the first version dependent on Hermes internals.
- Do not store third-party credentials outside Chrome profile storage.

## Target users

1. Developers running multiple coding/research agents locally.
2. Agent frameworks needing a reliable browser substrate.
3. Automation scripts needing persistent logged-in browser state.
4. Humans who need to inspect and debug what agents did in the browser.

## Naming

Project name: **Glasshouse**

Primary CLI binary: **`glass`**

Suggested package name for npm: `glasshouse` or `@trmd/glasshouse`.

## Key concepts

### Profile

A named browser environment:

- Chrome user data directory
- CDP port or CDP URL
- optional executable path
- headless/headed mode
- allowed host policy
- metadata and runtime status

Profiles should be stable across sessions so login cookies persist.

### Default profile resolution

Every command that needs a profile should resolve profile in this order:

1. explicit CLI flag: `--profile <name>`
2. environment variable: `GLASS_PROFILE`
3. environment variable fallback: `GLASSHOUSE_PROFILE`
4. config default profile: `defaultProfile`
5. hardcoded fallback: `default`

This matters because agents should be able to receive browser context via environment without having to thread flags through every shell command.

Examples:

```bash
export GLASS_PROFILE=x-main
glass open https://x.com
glass snapshot --json
```

Equivalent explicit form:

```bash
glass open --profile x-main https://x.com
```

### Managed profile

Glasshouse launches Chrome itself with:

- `--user-data-dir=<profile dir>`
- `--remote-debugging-port=<profile port>`
- automation-friendly defaults

### External/attach profile

Glasshouse attaches to an existing CDP endpoint:

- `cdpUrl: http://127.0.0.1:9222`
- no process lifecycle ownership
- status should say `external`

## MVP requirements

### CLI

Implement the `glass` CLI with these commands:

```bash
glass init

glass profile create <name> [--port N] [--headless] [--chrome PATH] [--cdp-url URL] [--attach]
glass profile list [--json]
glass profile show <name> [--json]
glass profile delete <name>
glass profile set-default <name>

glass start [--profile NAME] [--headless|--headed]
glass stop [--profile NAME]
glass status [--profile NAME] [--json]

glass open [--profile NAME] <url>
glass navigate [--profile NAME] <url>
glass tabs [--profile NAME] [--json]
glass focus [--profile NAME] <targetId-or-prefix>
glass close [--profile NAME] <targetId-or-prefix>

glass snapshot [--profile NAME] [--json] [--format ai|aria] [--limit N]
glass click [--profile NAME] <ref>
glass type [--profile NAME] <ref> <text> [--submit]
glass press [--profile NAME] <key>
glass evaluate [--profile NAME] <js>
glass screenshot [--profile NAME] [--full-page] [--output PATH] [--json]

glass cookies [--profile NAME] [--json]
glass storage [--profile NAME] [--json]

glass policy allow [--profile NAME] <host...>
glass policy deny [--profile NAME] <host...>
glass policy show [--profile NAME] [--json]

glass mcp serve
```

For MVP, it is acceptable for `glass cookies` and `glass storage` to be read-only.

### JSON output

All commands that return structured data should support `--json`.

JSON should be stable and machine-friendly. Avoid prose inside JSON except for `message` or `error` fields.

### Browser engine

Use Playwright over CDP:

- dependency: `playwright-core`
- connect using `chromium.connectOverCDP(cdpUrl)`
- launch Chrome with `child_process.spawn`
- discover installed Chrome on macOS/Linux where possible

Use system Chrome first; do not force a bundled browser download for MVP.

### Snapshot format

Need an agent-friendly snapshot with stable refs.

Minimum snapshot JSON:

```json
{
  "url": "https://example.com",
  "title": "Example Domain",
  "elements": [
    {
      "ref": "1",
      "role": "link",
      "name": "More information",
      "text": "More information...",
      "selector": "...best effort...",
      "visible": true
    }
  ]
}
```

Plain text snapshot should be compact:

```text
Page: Example Domain
URL: https://example.com
[1] link "More information"
```

The refs only need to be stable until the next snapshot/action in the same profile/session. Store a short-lived ref registry per profile in runtime state.

### Clicking and typing by ref

After `snapshot`, commands such as `click 1` and `type 2 hello` should resolve refs from the latest snapshot for that profile.

If no snapshot exists, return a helpful error:

```text
No snapshot refs for profile x-main. Run `glass snapshot` first.
```

### Artifacts

Screenshots and downloads should go under:

```text
~/.glasshouse/artifacts/screenshots/
~/.glasshouse/artifacts/downloads/
~/.glasshouse/artifacts/traces/
```

`screenshot --json` should return:

```json
{
  "path": "/absolute/path/to/file.png",
  "media": "MEDIA:/absolute/path/to/file.png"
}
```

### Config and state

Default home:

```text
~/.glasshouse/
```

Allow override:

```bash
GLASS_HOME=/tmp/glass-test glass init
```

Files:

```text
~/.glasshouse/config.json
~/.glasshouse/profiles/<name>/chrome-user-data/
~/.glasshouse/runtime/<name>.json
~/.glasshouse/artifacts/
```

`config.json` sketch:

```json
{
  "defaultProfile": "default",
  "profiles": {
    "default": {
      "driver": "managed",
      "userDataDir": "~/.glasshouse/profiles/default/chrome-user-data",
      "port": 9333,
      "headless": false,
      "chrome": null,
      "allowedHosts": []
    }
  }
}
```

Runtime file sketch:

```json
{
  "profile": "default",
  "pid": 12345,
  "port": 9333,
  "cdpUrl": "http://127.0.0.1:9333",
  "startedAt": "2026-05-17T...Z",
  "refs": {
    "createdAt": "...",
    "items": {
      "1": { "selector": "text=..." }
    }
  }
}
```

### Policy

MVP policy can be simple host allow/deny checks for navigation commands.

Rules:

- deny list wins over allow list
- if allow list is empty, allow public web URLs but block obvious local/private network targets by default
- always block by default:
  - `file://`
  - `chrome://`
  - `devtools://`
  - `http://169.254.169.254`
  - private LAN targets unless explicitly allowed

This is not perfect SSRF protection, but it avoids the most stupid footguns.

### MCP server

`glass mcp serve` should expose at least:

- `profile_list`
- `profile_status`
- `open`
- `snapshot`
- `click`
- `type`
- `press`
- `screenshot`

It may use `@modelcontextprotocol/sdk`.

### Tests

Use Node/TypeScript. Recommended stack:

- TypeScript
- Vitest
- `tsx` or `tsup`
- Commander or CAC for CLI parsing

Tests should cover:

- profile resolution order, especially `GLASS_PROFILE`
- config creation under temporary `GLASS_HOME`
- profile create/list/show/delete
- start command builds expected Chrome args
- policy allow/deny logic
- JSON output shape
- snapshot ref registry behavior with mocked Playwright/page objects
- command parsing smoke tests

Browser integration tests should be optional and skipped unless Chrome is available:

```bash
GLASS_INTEGRATION=1 npm test
```

Default `npm test` must pass in CI without a real browser if possible.

### Acceptance criteria

MVP is done when:

1. `npm install`, `npm run build`, `npm test` pass.
2. `glass init` creates config in `GLASS_HOME`.
3. `GLASS_PROFILE=foo glass status --json` resolves profile `foo`.
4. A managed profile can be created and started on macOS with installed Chrome.
5. `glass open`, `glass snapshot`, `glass screenshot`, `glass click`, `glass type`, and `glass press` work on a simple test page.
6. `glass mcp serve` exposes basic tools without crashing.
7. README explains install, quickstart, env profile selection, MCP setup, and security model.

## Design taste

Glasshouse should feel like infrastructure, not a toy demo.

- Quiet by default.
- Good errors.
- JSON everywhere agents need it.
- Stable config files.
- No hidden global state except under `GLASS_HOME`.
- Human-debuggable process/runtime files.

## Future ideas

- Browserless/Browserbase backends.
- Trace viewer.
- Per-agent ACLs/tokens.
- Shared daemon with HTTP API.
- More robust accessibility snapshots.
- Automatic login/profile bootstrap flow.
- Native Hermes toolset adapter.
- AgentPit integration helpers.
