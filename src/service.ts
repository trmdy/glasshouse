import { mkdir } from "node:fs/promises";
import { buildChromeArgs, discoverChrome, spawnChrome } from "./chrome.js";
import { ensureGlassHome, loadConfig } from "./config.js";
import { GlassError } from "./errors.js";
import { deleteRuntime, readRuntime, writeRuntime } from "./runtime.js";

export async function startProfile(home: string, profileName: string, overrides: { headless?: boolean } = {}) {
  const config = await ensureGlassHome(home);
  const profile = config.profiles[profileName];
  if (!profile) throw new GlassError(`Profile ${profileName} does not exist`, { code: "PROFILE_NOT_FOUND", profile: profileName });

  if (profile.driver === "external") {
    await writeRuntime(home, profileName, {
      profile: profileName,
      status: "external",
      cdpUrl: profile.cdpUrl,
      startedAt: new Date().toISOString()
    });
    return { profile: profileName, status: "external", cdpUrl: profile.cdpUrl };
  }

  if (!profile.userDataDir || !profile.port) {
    throw new GlassError(`Managed profile ${profileName} is missing userDataDir or port`, { code: "PROFILE_INVALID", profile: profileName });
  }
  const existing = await readRuntime(home, profileName);
  if (existing?.pid) return { profile: profileName, status: "managed", pid: existing.pid, port: existing.port, cdpUrl: existing.cdpUrl };

  const executable = profile.chrome ?? (await discoverChrome());
  if (!executable) {
    throw new GlassError("Could not find system Chrome. Set profile chrome path with `glass profile create --chrome PATH`.", { code: "CHROME_NOT_FOUND", profile: profileName });
  }

  const port = profile.port;
  const cdpUrl = `http://127.0.0.1:${port}`;
  if (await isCdpReachable(cdpUrl)) {
    throw new GlassError(`CDP port ${port} is already in use, but Glasshouse has no runtime for profile ${profileName}. Stop the other Chrome or choose another port.`, {
      code: "PORT_IN_USE",
      profile: profileName
    });
  }

  await mkdir(profile.userDataDir, { recursive: true });
  const args = buildChromeArgs({ userDataDir: profile.userDataDir, port, headless: overrides.headless ?? profile.headless });
  const child = spawnChrome(executable, args);
  await waitForCdp(cdpUrl, child.pid);
  await writeRuntime(home, profileName, {
    profile: profileName,
    status: "managed",
    pid: child.pid,
    port,
    cdpUrl,
    startedAt: new Date().toISOString()
  });
  return { profile: profileName, status: "managed", pid: child.pid, port, cdpUrl };
}

export async function stopProfile(home: string, profileName: string) {
  const runtime = await readRuntime(home, profileName);
  if (runtime?.pid) {
    try {
      // Chrome is launched detached; kill the process group so helpers do not
      // linger and keep the CDP port occupied after `glass stop`.
      process.kill(-runtime.pid);
    } catch {
      try {
        process.kill(runtime.pid);
      } catch {
        // Process may already be gone; runtime cleanup still matters.
      }
    }
  }
  await deleteRuntime(home, profileName);
  return { profile: profileName, stopped: true };
}

export async function statusProfile(home: string, profileName: string) {
  const config = await loadConfig(home);
  const profile = config.profiles[profileName];
  if (!profile) throw new GlassError(`Profile ${profileName} does not exist`, { code: "PROFILE_NOT_FOUND", profile: profileName });
  const runtime = await readRuntime(home, profileName);
  return {
    profile: profileName,
    driver: profile.driver,
    configured: true,
    running: Boolean(runtime?.cdpUrl || runtime?.pid),
    runtime
  };
}

async function isCdpReachable(cdpUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${cdpUrl}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForCdp(cdpUrl: string, pid: number | undefined): Promise<void> {
  const deadline = Date.now() + 8000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${cdpUrl}/json/version`);
      if (response.ok) return;
      lastError = new Error(`CDP returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new GlassError(`Chrome started${pid ? ` with pid ${pid}` : ""}, but CDP did not become ready at ${cdpUrl}: ${lastError instanceof Error ? lastError.message : String(lastError)}`, {
    code: "CDP_NOT_READY"
  });
}
