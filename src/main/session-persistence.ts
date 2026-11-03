import type { Cookie, Session } from "electron";
import { logger } from "./logger.js";

const PERSISTED_DAYS = 30;
const SECONDS_PER_DAY = 86_400;

/**
 * Authentik issues its login cookie without an expiry, and Chromium drops such cookies when the app
 * quits: the password was asked again at every launch. Session cookies of trusted sites get an expiry,
 * so they are written to disk and the login survives restarts. "Se déconnecter" clears them.
 */
export function persistSessionCookies(session: Session, isTrusted: (url: string) => boolean): void {
  session.cookies.on("changed", (_event, cookie, _cause, removed) => {
    if (removed || !cookie.session) return;
    const url = cookieUrl(cookie);
    if (!isTrusted(url)) return;

    // Same cookie (name, value, path, flags), only made persistent.
    const { domain, hostOnly, session: isSessionCookie, expirationDate, ...attributes } = cookie;
    session.cookies
      .set({
        ...attributes,
        url,
        // A host-only cookie must stay host-only: setting `domain` would widen it to subdomains.
        ...(!hostOnly && domain && { domain }),
        expirationDate: Date.now() / 1000 + PERSISTED_DAYS * SECONDS_PER_DAY,
      })
      .then(() => session.cookies.flushStore())
      .then(() => logger.debug({ name: cookie.name, url }, "Session cookie persisted"))
      // Optional comfort: on failure the user just logs in again.
      .catch((error: unknown) => logger.warn({ err: error, name: cookie.name, url }, "Could not persist session cookie"));
  });
}

function cookieUrl({ domain, path, secure }: Cookie): string {
  return `${secure ? "https" : "http"}://${(domain ?? "").replace(/^\./, "")}${path ?? "/"}`;
}
