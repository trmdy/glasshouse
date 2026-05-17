# Glasshouse

Open-source local browser control plane for AI agents.

Glasshouse gives agents named, persistent, policy-controlled Chrome profiles through a CLI, local API, and MCP server. It is intentionally framework-neutral: Hermes, Codex, Claude Code, OpenCode, AgentPit workers, and shell scripts should all be able to use it.

Project name: **Glasshouse**  
CLI binary: **`glass`**

## Core idea

```text
agent / script / human
        ↓
      glass CLI / MCP
        ↓
  named browser profile
        ↓
 Chrome + CDP + Playwright
```

## Example

```bash
glass init
glass profile create x-main

export GLASS_PROFILE=x-main
glass start
glass open https://x.com
glass snapshot
glass screenshot --json
```

Profile resolution order:

1. `--profile <name>`
2. `GLASS_PROFILE`
3. `GLASSHOUSE_PROFILE`
4. config `defaultProfile`
5. `default`

## Product requirements

See [PRD.md](./PRD.md).
