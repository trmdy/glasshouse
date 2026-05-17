import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export interface ChromeArgsInput {
  userDataDir: string;
  port: number;
  headless: boolean;
}

export function buildChromeArgs(input: ChromeArgsInput): string[] {
  const args = [
    `--user-data-dir=${input.userDataDir}`,
    `--remote-debugging-port=${input.port}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-client-side-phishing-detection",
    "--disable-component-update",
    "--disable-features=Translate,MediaRouter",
    "--disable-session-crashed-bubble",
    "--hide-crash-restore-bubble",
    // Matches OpenClaw's macOS-friendly managed Chrome baseline: avoid OS
    // keychain prompts for fresh agent-owned user-data dirs.
    "--password-store=basic"
  ];
  if (input.headless) args.push("--headless=new");
  return args;
}

export async function discoverChrome(): Promise<string | null> {
  const candidates = process.platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        "/Applications/Chromium.app/Contents/MacOS/Chromium"
      ]
    : [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser"
      ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

export function spawnChrome(executable: string, args: string[]): ChildProcess {
  const child = spawn(executable, args, {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return child;
}
