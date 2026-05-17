#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { openUrl, clickRef, closeTab, evaluateJs, focusTab, listTabs, pressKey, readCookies, readStorage, snapshotPage, takeScreenshot, typeRef } from "./browser.js";
import { ensureGlassHome, getGlassHome, loadConfig, nextProfilePort, resolveProfileName, saveConfig } from "./config.js";
import { errorToJson, GlassError } from "./errors.js";
import { serveMcp } from "./mcp.js";
import { checkNavigationPolicy } from "./policy.js";
import { startProfile, statusProfile, stopProfile } from "./service.js";
import type { GlassConfig, ProfileConfig, SnapshotResult } from "./types.js";

export interface CliIo {
  env: NodeJS.ProcessEnv;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  exitOverride?: boolean;
}

export async function runCli(args: string[], io: Partial<CliIo> = {}): Promise<number> {
  const env = io.env ?? process.env;
  const stdout = io.stdout ?? ((line: string) => console.log(line));
  const stderr = io.stderr ?? ((line: string) => console.error(line));
  const home = getGlassHome(env);
  const program = buildProgram({ env, stdout, stderr, home });

  try {
    await program.parseAsync(args, { from: "user" });
    return 0;
  } catch (error) {
    if (isCommanderDisplayExit(error)) return 0;
    const wantsJson = args.includes("--json");
    if (wantsJson) stdout(JSON.stringify(errorToJson(error)));
    else stderr(error instanceof Error ? error.message : String(error));
    if (!io.exitOverride) process.exitCode = 1;
    return 1;
  }
}

function isCommanderDisplayExit(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && ["commander.helpDisplayed", "commander.version"].includes(String((error as { code: unknown }).code));
}

function buildProgram(context: ProgramContext & { stdout: (line: string) => void; stderr: (line: string) => void }): Command {
  const program = new Command();
  program.name("glass").description("Glasshouse local browser control plane").version("0.1.0").exitOverride();
  program.option("--profile <name>", "profile name");
  context.program = program;

  program
    .command("init")
    .option("--json", "emit JSON")
    .action(async (options) => {
      const config = await ensureGlassHome(context.home);
      emit(context.stdout, options.json, { ok: true, home: context.home, defaultProfile: config.defaultProfile }, `Initialized Glasshouse at ${context.home}`);
    });

  const profile = program.command("profile").description("manage profiles");
  profile
    .command("create")
    .argument("<name>")
    .option("--port <number>", "CDP port", parseIntOption)
    .option("--headless", "run headless")
    .option("--chrome <path>", "Chrome executable")
    .option("--cdp-url <url>", "external CDP URL")
    .option("--attach", "attach to external CDP URL")
    .action(async (name, options) => {
      const config = await ensureGlassHome(context.home);
      if (config.profiles[name]) throw new GlassError(`Profile ${name} already exists`, { code: "PROFILE_EXISTS", profile: name });
      const attach = Boolean(options.attach || options.cdpUrl);
      config.profiles[name] = {
        driver: attach ? "external" : "managed",
        userDataDir: attach ? null : path.join(context.home, "profiles", name, "chrome-user-data"),
        port: attach ? null : (options.port ?? nextProfilePort(config)),
        headless: Boolean(options.headless),
        chrome: options.chrome ?? null,
        cdpUrl: options.cdpUrl ?? null,
        allowedHosts: [],
        deniedHosts: []
      };
      await saveConfig(context.home, config);
      context.stdout(`Created profile ${name}`);
    });

  profile
    .command("list")
    .option("--json", "emit JSON")
    .action(async (options) => {
      const config = await ensureGlassHome(context.home);
      const profiles = Object.entries(config.profiles).map(([name, value]) => ({ name, ...value, default: name === config.defaultProfile }));
      emit(context.stdout, options.json, { profiles, defaultProfile: config.defaultProfile }, profiles.map((item) => `${item.default ? "*" : " "} ${item.name}`).join("\n"));
    });

  profile
    .command("show")
    .argument("<name>")
    .option("--json", "emit JSON")
    .action(async (name, options) => {
      const config = await loadConfig(context.home);
      const item = requireProfile(config, name);
      emit(context.stdout, options.json, { name, ...item, default: name === config.defaultProfile }, JSON.stringify({ name, ...item }, null, 2));
    });

  profile
    .command("delete")
    .argument("<name>")
    .action(async (name) => {
      const config = await loadConfig(context.home);
      if (name === config.defaultProfile) throw new GlassError(`Cannot delete default profile ${name}`, { code: "DEFAULT_PROFILE", profile: name });
      requireProfile(config, name);
      delete config.profiles[name];
      await saveConfig(context.home, config);
      context.stdout(`Deleted profile ${name}`);
    });

  profile
    .command("set-default")
    .argument("<name>")
    .action(async (name) => {
      const config = await loadConfig(context.home);
      requireProfile(config, name);
      config.defaultProfile = name;
      await saveConfig(context.home, config);
      context.stdout(`Default profile set to ${name}`);
    });

  program.command("start").option("--profile <name>").option("--headless").option("--headed").option("--json").action(async (options) => {
    const config = await ensureGlassHome(context.home);
    const name = resolveProfileName(commandProfileOptions(context, options), context.env, config);
    const result = await startProfile(context.home, name, { headless: options.headless ? true : options.headed ? false : undefined });
    emit(context.stdout, options.json, { ok: true, ...result }, `Started ${name}`);
  });

  program.command("stop").option("--profile <name>").option("--json").action(async (options) => {
    const config = await ensureGlassHome(context.home);
    const name = resolveProfileName(commandProfileOptions(context, options), context.env, config);
    emit(context.stdout, options.json, { ok: true, ...(await stopProfile(context.home, name)) }, `Stopped ${name}`);
  });

  program.command("status").option("--profile <name>").option("--json").action(async (options) => {
    const config = await ensureGlassHome(context.home);
    const name = resolveProfileName(commandProfileOptions(context, options), context.env, config);
    const status = await statusProfile(context.home, name);
    emit(context.stdout, options.json, { ok: true, ...status }, formatStatus(status));
  });

  program.command("open").option("--profile <name>").argument("<url>").option("--json").action(async (url, options) => {
    await withProfile(context, options, async (name) => emit(context.stdout, options.json, { ok: true, ...(await openUrl(context.home, name, url, false)) }, `Opened ${url}`));
  });
  program.command("navigate").option("--profile <name>").argument("<url>").option("--json").action(async (url, options) => {
    await withProfile(context, options, async (name) => emit(context.stdout, options.json, { ok: true, ...(await openUrl(context.home, name, url, true)) }, `Navigated to ${url}`));
  });
  program.command("tabs").option("--profile <name>").option("--json").action(async (options) => {
    await withProfile(context, options, async (name) => {
      const tabs = await listTabs(context.home, name);
      emit(context.stdout, options.json, { tabs }, JSON.stringify(tabs, null, 2));
    });
  });
  program.command("focus").option("--profile <name>").argument("<target>").option("--json").action(async (target, options) => {
    await withProfile(context, options, async (name) => emit(context.stdout, options.json, { ok: true, ...(await focusTab(context.home, name, target)) }, `Focused ${target}`));
  });
  program.command("close").option("--profile <name>").argument("<target>").option("--json").action(async (target, options) => {
    await withProfile(context, options, async (name) => emit(context.stdout, options.json, { ok: true, ...(await closeTab(context.home, name, target)) }, `Closed ${target}`));
  });

  program.command("snapshot").option("--profile <name>").option("--json").option("--format <format>", "ai|aria", "ai").option("--limit <number>", "max refs", parseIntOption).action(async (options) => {
    await withProfile(context, options, async (name) => {
      const snapshot = await snapshotPage(context.home, name, options.limit);
      emit(context.stdout, options.json, snapshot, formatSnapshot(snapshot));
    });
  });
  program.command("click").option("--profile <name>").argument("<ref>").option("--json").action(async (ref, options) => {
    await withProfile(context, options, async (name) => emit(context.stdout, options.json, { ok: true, ...(await clickRef(context.home, name, ref)) }, `Clicked ${ref}`));
  });
  program.command("type").option("--profile <name>").argument("<ref>").argument("<text>").option("--submit").option("--json").action(async (ref, text, options) => {
    await withProfile(context, options, async (name) => emit(context.stdout, options.json, { ok: true, ...(await typeRef(context.home, name, ref, text, options.submit)) }, `Typed into ${ref}`));
  });
  program.command("press").option("--profile <name>").argument("<key>").option("--json").action(async (key, options) => {
    await withProfile(context, options, async (name) => emit(context.stdout, options.json, { ok: true, ...(await pressKey(context.home, name, key)) }, `Pressed ${key}`));
  });
  program.command("evaluate").option("--profile <name>").argument("<js>").option("--json").action(async (js, options) => {
    await withProfile(context, options, async (name) => emit(context.stdout, true, await evaluateJs(context.home, name, js), ""));
  });
  program.command("screenshot").option("--profile <name>").option("--full-page").option("--output <path>").option("--json").action(async (options) => {
    await withProfile(context, options, async (name) => {
      const result = await takeScreenshot(context.home, name, { fullPage: options.fullPage, output: options.output });
      emit(context.stdout, options.json, result, result.path);
    });
  });
  program.command("cookies").option("--profile <name>").option("--json").action(async (options) => {
    await withProfile(context, options, async (name) => {
      const cookies = await readCookies(context.home, name);
      emit(context.stdout, options.json, cookies, JSON.stringify(cookies, null, 2));
    });
  });
  program.command("storage").option("--profile <name>").option("--json").action(async (options) => {
    await withProfile(context, options, async (name) => {
      const storage = await readStorage(context.home, name);
      emit(context.stdout, options.json, storage, JSON.stringify(storage, null, 2));
    });
  });

  const policy = program.command("policy").description("manage host policy");
  policy.command("allow").option("--profile <name>").argument("<host...>").action(async (hosts, options) => updatePolicy(context, options, hosts, "allow"));
  policy.command("deny").option("--profile <name>").argument("<host...>").action(async (hosts, options) => updatePolicy(context, options, hosts, "deny"));
  policy.command("show").option("--profile <name>").option("--json").action(async (options) => {
    await withProfileConfig(context, options, async (name, profileConfig) => {
      emit(context.stdout, options.json, { profile: name, allowedHosts: profileConfig.allowedHosts, deniedHosts: profileConfig.deniedHosts }, `allow: ${profileConfig.allowedHosts.join(", ") || "(none)"}\ndeny: ${profileConfig.deniedHosts.join(", ") || "(none)"}`);
    });
  });

  const mcp = program.command("mcp");
  mcp.command("serve").action(async () => serveMcp(context.env));

  return program;
}

interface ProgramContext {
  env: NodeJS.ProcessEnv;
  home: string;
  stdout?: (line: string) => void;
  program?: Command;
}

async function withProfile(context: ProgramContext, options: { profile?: string }, fn: (profile: string) => Promise<void>): Promise<void> {
  const config = await ensureGlassHome(context.home);
  await fn(resolveProfileName(commandProfileOptions(context, options), context.env, config));
}

async function withProfileConfig(context: ProgramContext, options: { profile?: string }, fn: (name: string, profile: ProfileConfig, config: GlassConfig) => Promise<void>): Promise<void> {
  const config = await ensureGlassHome(context.home);
  const name = resolveProfileName(commandProfileOptions(context, options), context.env, config);
  await fn(name, requireProfile(config, name), config);
}

async function updatePolicy(context: ProgramContext & { stdout: (line: string) => void }, options: { profile?: string }, hosts: string[], mode: "allow" | "deny") {
  await withProfileConfig(context, options, async (name, profile, config) => {
    const key = mode === "allow" ? "allowedHosts" : "deniedHosts";
    profile[key] = Array.from(new Set([...profile[key], ...hosts]));
    await saveConfig(context.home, config);
    context.stdout(`${mode === "allow" ? "Allowed" : "Denied"} ${hosts.join(", ")} for ${name}`);
  });
}

function commandProfileOptions(context: ProgramContext, options: { profile?: string }): { profile?: string } {
  return { profile: options.profile ?? context.program?.opts().profile };
}

function requireProfile(config: GlassConfig, name: string): ProfileConfig {
  const profile = config.profiles[name];
  if (!profile) throw new GlassError(`Profile ${name} does not exist`, { code: "PROFILE_NOT_FOUND", profile: name });
  return profile;
}

function emit(stdout: (line: string) => void, json: boolean | undefined, value: unknown, text: string): void {
  stdout(json ? JSON.stringify(value) : text);
}

function formatStatus(status: Awaited<ReturnType<typeof statusProfile>>): string {
  return `${status.profile}: ${status.running ? "running" : "stopped"} (${status.driver})`;
}

function formatSnapshot(snapshot: SnapshotResult): string {
  const lines = [`Page: ${snapshot.title}`, `URL: ${snapshot.url}`];
  for (const element of snapshot.elements) lines.push(`[${element.ref}] ${element.role} "${element.name || element.text}"`);
  return lines.join("\n");
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) throw new GlassError(`Expected integer, got ${value}`, { code: "INVALID_OPTION" });
  return parsed;
}

export { checkNavigationPolicy };

if (import.meta.url === `file://${process.argv[1]}`) {
  void runCli(process.argv.slice(2));
}
