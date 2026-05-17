import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createDefaultConfig, ensureGlassHome, loadConfig, resolveProfileName, saveConfig } from "../src/config.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "glass-config-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("config and profile resolution", () => {
  test("init creates config and expected directories under GLASS_HOME", async () => {
    const config = await ensureGlassHome(home);

    expect(config.defaultProfile).toBe("default");
    expect(config.profiles.default.port).toBe(9333);
    expect(config.profiles.default.userDataDir).toContain(home);

    const loaded = await loadConfig(home);
    expect(loaded.profiles.default.driver).toBe("managed");
  });

  test("profile resolution follows CLI, GLASS_PROFILE, GLASSHOUSE_PROFILE, config, default order", () => {
    const config = createDefaultConfig(home);

    expect(resolveProfileName({ profile: "cli" }, { GLASS_PROFILE: "env" }, config)).toBe("cli");
    expect(resolveProfileName({}, { GLASS_PROFILE: "env", GLASSHOUSE_PROFILE: "legacy" }, config)).toBe("env");
    expect(resolveProfileName({}, { GLASSHOUSE_PROFILE: "legacy" }, config)).toBe("legacy");
    expect(resolveProfileName({}, {}, { ...config, defaultProfile: "cfg" })).toBe("cfg");
    expect(resolveProfileName({}, {}, { ...config, defaultProfile: "" })).toBe("default");
  });

  test("profile create list show delete and default persist", async () => {
    const config = createDefaultConfig(home);
    config.profiles.work = {
      driver: "managed",
      userDataDir: path.join(home, "profiles", "work", "chrome-user-data"),
      port: 9444,
      headless: true,
      chrome: null,
      allowedHosts: [],
      deniedHosts: []
    };
    config.defaultProfile = "work";
    await saveConfig(home, config);

    const loaded = await loadConfig(home);
    expect(Object.keys(loaded.profiles).sort()).toEqual(["default", "work"]);
    expect(loaded.defaultProfile).toBe("work");

    delete loaded.profiles.work;
    loaded.defaultProfile = "default";
    await saveConfig(home, loaded);

    const deleted = await loadConfig(home);
    expect(deleted.profiles.work).toBeUndefined();
    expect(deleted.defaultProfile).toBe("default");
  });
});
