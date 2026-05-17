import { describe, expect, test } from "vitest";
import { checkNavigationPolicy } from "../src/policy.js";
import type { ProfileConfig } from "../src/types.js";

const baseProfile: ProfileConfig = {
  driver: "managed",
  userDataDir: "/tmp/glass/profile",
  port: 9333,
  headless: false,
  chrome: null,
  allowedHosts: [],
  deniedHosts: []
};

describe("navigation policy", () => {
  test("allows public web urls when no allow list is configured", () => {
    expect(checkNavigationPolicy("https://example.com", baseProfile).allowed).toBe(true);
  });

  test("deny list wins over allow list", () => {
    const result = checkNavigationPolicy("https://example.com", {
      ...baseProfile,
      allowedHosts: ["example.com"],
      deniedHosts: ["example.com"]
    });

    expect(result).toEqual({ allowed: false, reason: "Host example.com is denied by policy" });
  });

  test("blocks dangerous schemes and private hosts unless explicitly allowed", () => {
    expect(checkNavigationPolicy("file:///etc/passwd", baseProfile).allowed).toBe(false);
    expect(checkNavigationPolicy("chrome://version", baseProfile).allowed).toBe(false);
    expect(checkNavigationPolicy("http://127.0.0.1:3000", baseProfile).allowed).toBe(false);

    expect(checkNavigationPolicy("http://127.0.0.1:3000", { ...baseProfile, allowedHosts: ["127.0.0.1"] }).allowed).toBe(true);
  });

  test("non-empty allow list restricts public urls", () => {
    expect(checkNavigationPolicy("https://denied.example", { ...baseProfile, allowedHosts: ["example.com"] }).allowed).toBe(false);
    expect(checkNavigationPolicy("https://sub.example.com", { ...baseProfile, allowedHosts: ["*.example.com"] }).allowed).toBe(true);
  });
});
