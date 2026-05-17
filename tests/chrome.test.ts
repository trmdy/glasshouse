import { describe, expect, test } from "vitest";
import { buildChromeArgs } from "../src/chrome.js";

describe("chrome launch args", () => {
  test("managed profile uses user data dir and remote debugging port", () => {
    const args = buildChromeArgs({
      userDataDir: "/tmp/glass/profile",
      port: 9444,
      headless: true
    });

    expect(args).toContain("--user-data-dir=/tmp/glass/profile");
    expect(args).toContain("--remote-debugging-port=9444");
    expect(args).toContain("--headless=new");
    expect(args).toContain("--no-first-run");
    expect(args).toContain("--password-store=basic");
    expect(args).toContain("--disable-sync");
    expect(args).not.toContain("--use-mock-keychain");
  });
});
