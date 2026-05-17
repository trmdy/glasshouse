import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function screenshotPath(home: string, profile: string, requested?: string): Promise<string> {
  const target = requested
    ? path.resolve(requested)
    : path.join(home, "artifacts", "screenshots", `${profile}-${new Date().toISOString().replaceAll(":", "-")}.png`);
  await mkdir(path.dirname(target), { recursive: true });
  return target;
}
