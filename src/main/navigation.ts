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

/**
 * The link a music app installed on this computer opens directly, rather than its web player: a Spotify track or
 * search becomes a `spotify:` URI, an Apple Music page a `music:` one. Undefined for any other link.
 */
export function nativeMusicAppUrl(url: string): string | undefined {
  const parsed = URL.parse(url);
  if (parsed?.protocol !== "https:") return undefined;
  if (parsed.hostname === "open.spotify.com") {
    const [kind, id] = parsed.pathname.split("/").filter(Boolean);
    if (kind === "track" && id && /^[A-Za-z0-9]+$/.test(id)) return `spotify:track:${id}`;
    if (kind === "search" && id) return `spotify:search:${id}`;
    return undefined;
  }
  if (parsed.hostname === "music.apple.com") return `music://music.apple.com${parsed.pathname}${parsed.search}`;
  return undefined;
}
