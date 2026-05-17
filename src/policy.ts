import net from "node:net";
import type { ProfileConfig } from "./types.js";

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

const blockedSchemes = new Set(["file:", "chrome:", "devtools:"]);

export function checkNavigationPolicy(rawUrl: string, profile: ProfileConfig): PolicyResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: `Invalid URL: ${rawUrl}` };
  }

  if (blockedSchemes.has(url.protocol)) {
    return { allowed: false, reason: `Scheme ${url.protocol} is blocked by policy` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, reason: `Scheme ${url.protocol} is not supported` };
  }

  const host = url.hostname.toLowerCase();
  if (matchesAny(host, profile.deniedHosts)) {
    return { allowed: false, reason: `Host ${host} is denied by policy` };
  }

  const allowList = profile.allowedHosts ?? [];
  const explicitlyAllowed = matchesAny(host, allowList);
  if (allowList.length > 0 && !explicitlyAllowed) {
    return { allowed: false, reason: `Host ${host} is not allowed by policy` };
  }

  if (isPrivateOrLocalHost(host) && !explicitlyAllowed) {
    return { allowed: false, reason: `Host ${host} is private/local and blocked by default` };
  }

  return { allowed: true };
}

export function matchesHost(host: string, pattern: string): boolean {
  const normalized = pattern.toLowerCase();
  if (normalized.startsWith("*.")) {
    const suffix = normalized.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === normalized;
}

function matchesAny(host: string, patterns: string[] = []): boolean {
  return patterns.some((pattern) => matchesHost(host, pattern));
}

function isPrivateOrLocalHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "169.254.169.254") return true;
  const ipVersion = net.isIP(host);
  if (ipVersion === 0) return false;
  if (ipVersion === 6) return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");

  const parts = host.split(".").map(Number);
  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
