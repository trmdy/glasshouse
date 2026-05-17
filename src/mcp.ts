import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getGlassHome, loadConfig, resolveProfileName } from "./config.js";
import { clickRef, openUrl, pressKey, snapshotPage, takeScreenshot, typeRef } from "./browser.js";
import { statusProfile } from "./service.js";

export async function serveMcp(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const home = getGlassHome(env);
  const server = new McpServer({ name: "glasshouse", version: "0.1.0" });

  server.tool("profile_list", "List Glasshouse profiles", {}, async () => {
    const config = await loadConfig(home);
    return jsonContent({ profiles: Object.keys(config.profiles), defaultProfile: config.defaultProfile });
  });

  server.tool("profile_status", "Get profile status", { profile: z.string().optional() }, async ({ profile }) => {
    const config = await loadConfig(home);
    return jsonContent(await statusProfile(home, resolveProfileName({ profile }, env, config)));
  });

  server.tool("open", "Open a URL", { url: z.string(), profile: z.string().optional() }, async ({ url, profile }) => {
    const config = await loadConfig(home);
    return jsonContent(await openUrl(home, resolveProfileName({ profile }, env, config), url, false));
  });

  server.tool("snapshot", "Capture page snapshot", { profile: z.string().optional(), limit: z.number().optional() }, async ({ profile, limit }) => {
    const config = await loadConfig(home);
    return jsonContent(await snapshotPage(home, resolveProfileName({ profile }, env, config), limit));
  });

  server.tool("click", "Click snapshot ref", { ref: z.string(), profile: z.string().optional() }, async ({ ref, profile }) => {
    const config = await loadConfig(home);
    return jsonContent(await clickRef(home, resolveProfileName({ profile }, env, config), ref));
  });

  server.tool("type", "Type into snapshot ref", { ref: z.string(), text: z.string(), submit: z.boolean().optional(), profile: z.string().optional() }, async ({ ref, text, submit, profile }) => {
    const config = await loadConfig(home);
    return jsonContent(await typeRef(home, resolveProfileName({ profile }, env, config), ref, text, submit));
  });

  server.tool("press", "Press a key", { key: z.string(), profile: z.string().optional() }, async ({ key, profile }) => {
    const config = await loadConfig(home);
    return jsonContent(await pressKey(home, resolveProfileName({ profile }, env, config), key));
  });

  server.tool("screenshot", "Take screenshot", { profile: z.string().optional(), fullPage: z.boolean().optional() }, async ({ profile, fullPage }) => {
    const config = await loadConfig(home);
    return jsonContent(await takeScreenshot(home, resolveProfileName({ profile }, env, config), { fullPage }));
  });

  await server.connect(new StdioServerTransport());
}

function jsonContent(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }]
  };
}
