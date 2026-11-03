/** Every WorkAdventure service (play, auth, Jitsi, map storage) lives under these domains. */
export const TRUSTED_DOMAINS = ["goyan.fr"] as const;

const EXTERNAL_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

export interface NavigationPolicy {
  domains: readonly string[];
  /** Exact origins trusted on top of the domains, e.g. a local dev server over plain http. */
  origins: readonly string[];
}

export function createPolicy(startUrl: string): NavigationPolicy {
  const base: NavigationPolicy = { domains: TRUSTED_DOMAINS, origins: [] };
  return isAllowedUrl(startUrl, base) ? base : { ...base, origins: [new URL(startUrl).origin] };
}

export function isAllowedUrl(url: string, policy: NavigationPolicy): boolean {
  const parsed = URL.parse(url);
  if (!parsed) return false;
  if (policy.origins.includes(parsed.origin)) return true;
  if (parsed.protocol !== "https:") return false;
  return policy.domains.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
}

export function isSafeExternalUrl(url: string): boolean {
  const parsed = URL.parse(url);
  return parsed !== null && EXTERNAL_PROTOCOLS.has(parsed.protocol);
}
