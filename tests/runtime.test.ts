import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getRef, readRuntime, updateRefs, writeRuntime } from "../src/runtime.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "glass-runtime-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("runtime ref registry", () => {
  test("snapshot refs replace previous refs for profile", async () => {
    await writeRuntime(home, "work", { profile: "work", status: "external", cdpUrl: "http://127.0.0.1:9222" });
    await updateRefs(home, "work", [
      { ref: "1", selector: "text=Old" },
      { ref: "2", selector: "text=Second" }
    ]);
    await updateRefs(home, "work", [{ ref: "1", selector: "text=New" }]);

    const runtime = await readRuntime(home, "work");
    expect(Object.keys(runtime?.refs?.items ?? {})).toEqual(["1"]);
    expect(await getRef(home, "work", "1")).toEqual({ selector: "text=New" });
    await expect(getRef(home, "work", "2")).rejects.toThrow("No snapshot ref 2");
  });
});
