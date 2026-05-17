import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runCli } from "../src/cli.js";

let home: string;
let stdout: string[];
let stderr: string[];

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "glass-cli-"));
  stdout = [];
  stderr = [];
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return runCli(args, {
    env: { ...process.env, ...env, GLASS_HOME: home },
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    exitOverride: true
  });
}

describe("cli parsing and json shapes", () => {
  test("init emits stable json when requested", async () => {
    const code = await run(["init", "--json"]);

    expect(code).toBe(0);
    expect(JSON.parse(stdout[0])).toMatchObject({ ok: true, defaultProfile: "default" });
  });

  test("status json reports env-selected missing profile clearly", async () => {
    await run(["init"]);
    const code = await run(["status", "--json"], { GLASS_PROFILE: "foo" });

    expect(code).toBe(1);
    expect(JSON.parse(stdout.at(-1) ?? "{}")).toMatchObject({
      ok: false,
      error: "Profile foo does not exist",
      profile: "foo"
    });
  });

  test("profile create and list json are machine-friendly", async () => {
    await run(["init"]);
    expect(await run(["profile", "create", "work", "--port", "9444", "--headless"])).toBe(0);
    expect(await run(["profile", "list", "--json"])).toBe(0);

    const listed = JSON.parse(stdout.at(-1) ?? "{}");
    expect(listed.profiles).toContainEqual(expect.objectContaining({ name: "work", port: 9444, headless: true }));
  });
});
