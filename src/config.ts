import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GlassConfig, ProfileConfig } from "./types.js";

export function getGlassHome(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(expandHome(env.GLASS_HOME ?? "~/.glasshouse"));
}

export function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function configPath(home: string): string {
  return path.join(home, "config.json");
}

export function createDefaultProfile(home: string, name = "default", port = 9333): ProfileConfig {
  return {
    driver: "managed",
    userDataDir: path.join(home, "profiles", name, "chrome-user-data"),
    port,
    headless: false,
    chrome: null,
    allowedHosts: [],
    deniedHosts: []
  };
}

export function createDefaultConfig(home: string): GlassConfig {
  return {
    defaultProfile: "default",
    profiles: {
      default: createDefaultProfile(home)
    }
  };
}

export async function ensureGlassHome(home: string): Promise<GlassConfig> {
  await mkdir(path.join(home, "profiles"), { recursive: true });
  await mkdir(path.join(home, "runtime"), { recursive: true });
  await mkdir(path.join(home, "artifacts", "screenshots"), { recursive: true });
  await mkdir(path.join(home, "artifacts", "downloads"), { recursive: true });
  await mkdir(path.join(home, "artifacts", "traces"), { recursive: true });

  try {
    return await loadConfig(home);
  } catch {
    const config = createDefaultConfig(home);
    await saveConfig(home, config);
    await mkdir(path.dirname(config.profiles.default.userDataDir ?? ""), { recursive: true });
    return config;
  }
}

export async function loadConfig(home: string): Promise<GlassConfig> {
  const raw = await readFile(configPath(home), "utf8");
  const parsed = JSON.parse(raw) as GlassConfig;
  for (const profile of Object.values(parsed.profiles)) {
    profile.allowedHosts ??= [];
    profile.deniedHosts ??= [];
    profile.headless ??= false;
    profile.chrome ??= null;
    profile.port ??= null;
  }
  return parsed;
}

export async function saveConfig(home: string, config: GlassConfig): Promise<void> {
  await mkdir(home, { recursive: true });
  await writeFile(configPath(home), `${JSON.stringify(config, null, 2)}\n`);
}

export function resolveProfileName(
  options: { profile?: string | null },
  env: NodeJS.ProcessEnv,
  config?: Pick<GlassConfig, "defaultProfile">
): string {
  return options.profile || env.GLASS_PROFILE || env.GLASSHOUSE_PROFILE || config?.defaultProfile || "default";
}

export function nextProfilePort(config: GlassConfig): number {
  const ports = Object.values(config.profiles)
    .map((profile) => profile.port)
    .filter((port): port is number => typeof port === "number");
  return Math.max(9333, ...ports) + 1;
}
