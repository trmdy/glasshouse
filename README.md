# Glasshouse

Glasshouse is an open-source local browser control plane for AI agents. It gives agents named, persistent, policy-controlled Chrome profiles through a CLI and MCP server.

Project name: **Glasshouse**  
CLI binary: **`glass`**

## Install

```bash
npm install
npm run build
npm link
```

For normal use, Glasshouse connects to system Chrome via CDP. It depends on `playwright-core` and does not download a bundled browser.

## Quickstart

```bash
glass init
glass profile create x-main

export GLASS_PROFILE=x-main
glass start
glass open https://example.com
glass snapshot
glass screenshot --json
```

`screenshot --json` returns an absolute artifact path and a media pointer:

```json
{
  "path": "/Users/you/.glasshouse/artifacts/screenshots/x-main-2026-05-17T10-00-00.000Z.png",
  "media": "MEDIA:/Users/you/.glasshouse/artifacts/screenshots/x-main-2026-05-17T10-00-00.000Z.png"
}
```

## Profiles

Profiles are persistent browser environments stored under `GLASS_HOME`, which defaults to `~/.glasshouse`.

```bash
glass profile create work --port 9444 --headless
glass profile create attached --attach --cdp-url http://127.0.0.1:9222
glass profile list --json
glass profile show work --json
glass profile set-default work
glass profile delete old-profile
```

Profile resolution order is:

1. `--profile <name>`
2. `GLASS_PROFILE`
3. `GLASSHOUSE_PROFILE`
4. config `defaultProfile`
5. `default`

Example:

```bash
GLASS_HOME=/tmp/glass-test GLASS_PROFILE=work glass status --json
```

## Browser Commands

```bash
glass start --profile work
glass status --profile work --json
glass stop --profile work

glass open https://example.com
glass navigate https://example.com/about
glass tabs --json
glass focus 1
glass close 1

glass snapshot --json --limit 40
glass click 1
glass type 2 "hello" --submit
glass press Escape
glass evaluate "document.title"
glass screenshot --full-page --json
glass cookies --json
glass storage --json
```

Snapshot refs are short-lived per profile. Run `glass snapshot` before `glass click 1` or `glass type 2 ...`.

## MCP

Run the MCP server over stdio:

```bash
glass mcp serve
```

Example MCP client config:

```json
{
  "mcpServers": {
    "glasshouse": {
      "command": "glass",
      "args": ["mcp", "serve"],
      "env": {
        "GLASS_PROFILE": "work"
      }
    }
  }
}
```

Exposed tools include `profile_list`, `profile_status`, `open`, `snapshot`, `click`, `type`, `press`, and `screenshot`.

## Security Model

Glasshouse applies a basic navigation policy before browser navigation:

- deny list wins over allow list
- `file://`, `chrome://`, and `devtools://` are blocked
- private and local hosts are blocked by default
- `169.254.169.254` is blocked by default
- explicit allow rules can permit specific private/local hosts

Manage policy per profile:

```bash
glass policy allow --profile work example.com "*.example.org"
glass policy deny --profile work dangerous.example
glass policy show --profile work --json
```

This is a local safety guard, not a complete sandbox. Agents using Glasshouse still execute in your local account and can interact with browser sessions you expose to them.

## Development

```bash
npm install
npm run build
npm test
node dist/cli.js --help
```

Default tests do not require a real browser. Browser smoke tests should be run explicitly:

```bash
GLASS_INTEGRATION=1 npm test
```

Useful isolated checks:

```bash
GLASS_HOME=$(mktemp -d) node dist/cli.js init
GLASS_HOME=$(mktemp -d) GLASS_PROFILE=foo node dist/cli.js status --json
```

## Files

```text
~/.glasshouse/config.json
~/.glasshouse/profiles/<name>/chrome-user-data/
~/.glasshouse/runtime/<name>.json
~/.glasshouse/artifacts/screenshots/
~/.glasshouse/artifacts/downloads/
~/.glasshouse/artifacts/traces/
```
