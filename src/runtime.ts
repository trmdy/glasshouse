import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { GlassError } from "./errors.js";
import type { RefItem, RuntimeState, SnapshotElement } from "./types.js";

export function runtimePath(home: string, profile: string): string {
  return path.join(home, "runtime", `${profile}.json`);
}

export async function readRuntime(home: string, profile: string): Promise<RuntimeState | null> {
  try {
    return JSON.parse(await readFile(runtimePath(home, profile), "utf8")) as RuntimeState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeRuntime(home: string, profile: string, state: RuntimeState): Promise<void> {
  await mkdir(path.join(home, "runtime"), { recursive: true });
  await writeFile(runtimePath(home, profile), `${JSON.stringify({ ...state, profile }, null, 2)}\n`);
}

export async function deleteRuntime(home: string, profile: string): Promise<void> {
  await rm(runtimePath(home, profile), { force: true });
}

export async function updateRefs(home: string, profile: string, elements: Array<Pick<SnapshotElement, "ref" | "selector">>): Promise<void> {
  const current = (await readRuntime(home, profile)) ?? { profile };
  const items: Record<string, RefItem> = {};
  for (const element of elements) items[element.ref] = { selector: element.selector };
  await writeRuntime(home, profile, {
    ...current,
    refs: {
      createdAt: new Date().toISOString(),
      items
    }
  });
}

export async function getRef(home: string, profile: string, ref: string): Promise<RefItem> {
  const runtime = await readRuntime(home, profile);
  if (!runtime?.refs) {
    throw new GlassError(`No snapshot refs for profile ${profile}. Run \`glass snapshot\` first.`, {
      code: "NO_REFS",
      profile
    });
  }
  const item = runtime.refs.items[ref];
  if (!item) {
    throw new GlassError(`No snapshot ref ${ref} for profile ${profile}. Run \`glass snapshot\` again.`, {
      code: "REF_NOT_FOUND",
      profile
    });
  }
  return item;
}
