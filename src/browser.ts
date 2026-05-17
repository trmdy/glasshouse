import { chromium, type Browser, type Page } from "playwright-core";
import { screenshotPath } from "./artifacts.js";
import { loadConfig } from "./config.js";
import { GlassError } from "./errors.js";
import { checkNavigationPolicy } from "./policy.js";
import { getRef, readRuntime, updateRefs, writeRuntime } from "./runtime.js";
import type { ProfileConfig, SnapshotElement, SnapshotResult } from "./types.js";

export async function connectForProfile(home: string, profileName: string): Promise<{ browser: Browser; page: Page; profile: ProfileConfig }> {
  const config = await loadConfig(home);
  const profile = config.profiles[profileName];
  if (!profile) throw new GlassError(`Profile ${profileName} does not exist`, { code: "PROFILE_NOT_FOUND", profile: profileName });

  const cdpUrl = profile.driver === "external" ? profile.cdpUrl : (await readRuntime(home, profileName))?.cdpUrl;
  if (!cdpUrl) throw new GlassError(`Profile ${profileName} is not running. Run \`glass start --profile ${profileName}\` first.`, { code: "NOT_RUNNING", profile: profileName });

  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const pages = context.pages().filter((candidate) => !candidate.isClosed());
  const runtime = await readRuntime(home, profileName);
  const activePage = runtime?.activeTargetId
    ? pages.find((candidate) => candidate.url() === runtime.activeTargetId || candidate.url().startsWith(runtime.activeTargetId ?? ""))
    : undefined;
  const page = activePage ?? pages.find((candidate) => !candidate.url().startsWith("chrome://")) ?? pages[0] ?? (await context.newPage());
  return { browser, page, profile };
}

export async function openUrl(home: string, profileName: string, url: string, reusePage: boolean): Promise<{ url: string; title: string }> {
  const { browser, page, profile } = await connectForProfile(home, profileName);
  try {
    const policy = checkNavigationPolicy(url, profile);
    if (!policy.allowed) throw new GlassError(policy.reason ?? "Blocked by policy", { code: "POLICY_BLOCKED", profile: profileName });
    const target = reusePage ? page : await page.context().newPage();
    await target.goto(url, { waitUntil: "domcontentloaded" });
    await writeRuntime(home, profileName, {
      ...((await readRuntime(home, profileName)) ?? { profile: profileName }),
      activeTargetId: target.url()
    });
    return { url: target.url(), title: await target.title() };
  } finally {
    await browser.close();
  }
}

export async function listTabs(home: string, profileName: string) {
  const { browser } = await connectForProfile(home, profileName);
  try {
    const pages = browser.contexts().flatMap((context) => context.pages()).filter((page) => !page.isClosed());
    const tabs = [];
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]!;
      let title = "";
      try {
        title = await page.title();
      } catch {
        title = "";
      }
      tabs.push({ id: String(index + 1), url: page.url(), title });
    }
    return tabs;
  } finally {
    await browser.close();
  }
}

export async function focusTab(home: string, profileName: string, target: string) {
  const { browser } = await connectForProfile(home, profileName);
  try {
    const page = selectPage(browser.contexts().flatMap((context) => context.pages()), target);
    await page.bringToFront();
    await writeRuntime(home, profileName, {
      ...((await readRuntime(home, profileName)) ?? { profile: profileName }),
      activeTargetId: page.url()
    });
    return { id: target, url: page.url(), title: await page.title() };
  } finally {
    await browser.close();
  }
}

export async function closeTab(home: string, profileName: string, target: string) {
  const { browser } = await connectForProfile(home, profileName);
  try {
    const page = selectPage(browser.contexts().flatMap((context) => context.pages()), target);
    const url = page.url();
    await page.close();
    return { closed: true, target, url };
  } finally {
    await browser.close();
  }
}

export async function snapshotPage(home: string, profileName: string, limit = 80): Promise<SnapshotResult> {
  const { browser, page } = await connectForProfile(home, profileName);
  try {
    const elements = await page.locator("a,button,input,textarea,select,[role],[contenteditable='true']").evaluateAll((nodes, max) => {
      function roleFor(node: Element): string {
        const explicit = node.getAttribute("role");
        if (explicit) return explicit;
        const tag = node.tagName.toLowerCase();
        if (tag === "a") return "link";
        if (tag === "button") return "button";
        if (tag === "input") return (node as HTMLInputElement).type || "input";
        return tag;
      }
      function selectorFor(node: Element, index: number): string {
        const id = node.getAttribute("id");
        if (id) return `#${CSS.escape(id)}`;
        const testId = node.getAttribute("data-testid");
        if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
        const text = (node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
        if (text) return `${node.tagName.toLowerCase()}:has-text("${text.replaceAll('"', '\\"')}")`;
        return `${node.tagName.toLowerCase()} >> nth=${index}`;
      }
      return nodes.slice(0, Number(max)).map((node, index) => {
        const element = node as HTMLElement;
        const text = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ");
        const aria = node.getAttribute("aria-label") || node.getAttribute("title") || "";
        return {
          ref: String(index + 1),
          role: roleFor(node),
          name: aria || text.slice(0, 120),
          text: text.slice(0, 240),
          selector: selectorFor(node, index),
          visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length)
        };
      });
    }, limit) as SnapshotElement[];

    const result = { url: page.url(), title: await page.title(), elements };
    await updateRefs(home, profileName, elements);
    return result;
  } finally {
    await browser.close();
  }
}

export async function clickRef(home: string, profileName: string, ref: string) {
  const { browser, page } = await connectForProfile(home, profileName);
  try {
    const item = await getRef(home, profileName, ref);
    await page.locator(item.selector).first().click();
    return { clicked: ref };
  } finally {
    await browser.close();
  }
}

export async function typeRef(home: string, profileName: string, ref: string, text: string, submit = false) {
  const { browser, page } = await connectForProfile(home, profileName);
  try {
    const item = await getRef(home, profileName, ref);
    const locator = page.locator(item.selector).first();
    await locator.fill(text);
    if (submit) await page.keyboard.press("Enter");
    return { typed: ref, submitted: submit };
  } finally {
    await browser.close();
  }
}

export async function pressKey(home: string, profileName: string, key: string) {
  const { browser, page } = await connectForProfile(home, profileName);
  try {
    await page.keyboard.press(key);
    return { pressed: key };
  } finally {
    await browser.close();
  }
}

export async function evaluateJs(home: string, profileName: string, js: string) {
  const { browser, page } = await connectForProfile(home, profileName);
  try {
    return { value: await page.evaluate(js) };
  } finally {
    await browser.close();
  }
}

export async function takeScreenshot(home: string, profileName: string, options: { fullPage?: boolean; output?: string }) {
  const { browser, page } = await connectForProfile(home, profileName);
  try {
    const path = await screenshotPath(home, profileName, options.output);
    await page.screenshot({ path, fullPage: options.fullPage ?? false });
    return { path, media: `MEDIA:${path}` };
  } finally {
    await browser.close();
  }
}

export async function readCookies(home: string, profileName: string) {
  const { browser, page } = await connectForProfile(home, profileName);
  try {
    return { cookies: await page.context().cookies() };
  } finally {
    await browser.close();
  }
}

export async function readStorage(home: string, profileName: string) {
  const { browser, page } = await connectForProfile(home, profileName);
  try {
    const origin = new URL(page.url()).origin;
    const localStorage = await page.evaluate(() => Object.fromEntries(Object.entries(window.localStorage)));
    const sessionStorage = await page.evaluate(() => Object.fromEntries(Object.entries(window.sessionStorage)));
    return { origin, localStorage, sessionStorage };
  } finally {
    await browser.close();
  }
}

function selectPage(pages: Page[], target: string): Page {
  const index = Number(target);
  if (Number.isInteger(index) && pages[index - 1]) return pages[index - 1];
  const match = pages.find((page) => page.url().startsWith(target));
  if (!match) throw new GlassError(`No tab matches ${target}`, { code: "TAB_NOT_FOUND" });
  return match;
}
