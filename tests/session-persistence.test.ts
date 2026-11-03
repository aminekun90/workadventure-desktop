import type { Cookie, CookiesSetDetails, Session } from "electron";
import { describe, expect, it, vi } from "vitest";
import { persistSessionCookies } from "../src/main/session-persistence.js";

type ChangedListener = (event: unknown, cookie: Cookie, cause: string, removed: boolean) => void;

function fakeSession(): { session: Session; change: (cookie: Cookie, removed?: boolean) => Promise<void>; set: ReturnType<typeof vi.fn> } {
  let listener: ChangedListener | undefined;
  const set = vi.fn<(details: CookiesSetDetails) => Promise<void>>(async () => undefined);
  const cookies = {
    on: (_event: "changed", handler: ChangedListener) => (listener = handler),
    set,
    flushStore: async () => undefined,
  };
  const change = async (cookie: Cookie, removed = false): Promise<void> => {
    listener?.({}, cookie, "explicit", removed);
    await vi.waitFor(() => undefined);
  };
  return { session: { cookies } as unknown as Session, change, set };
}

const trustGoyan = (url: string): boolean => new URL(url).hostname.endsWith("goyan.fr");
const sessionCookie: Cookie = {
  name: "authentik_session",
  value: "abc",
  domain: "auth.goyan.fr",
  hostOnly: true,
  path: "/",
  secure: true,
  httpOnly: true,
  session: true,
  sameSite: "lax",
};

describe("persistSessionCookies", () => {
  it("gives a trusted session cookie an expiry, keeping it host-only", async () => {
    const { session, change, set } = fakeSession();
    persistSessionCookies(session, trustGoyan);
    await change(sessionCookie);

    expect(set).toHaveBeenCalledOnce();
    const details = set.mock.calls[0]?.[0] as CookiesSetDetails;
    expect(details).toMatchObject({ url: "https://auth.goyan.fr/", name: "authentik_session", value: "abc", httpOnly: true });
    expect(details.domain).toBeUndefined();
    expect(details.expirationDate).toBeGreaterThan(Date.now() / 1000 + 29 * 86_400);
  });

  it("keeps the domain of a domain cookie", async () => {
    const { session, change, set } = fakeSession();
    persistSessionCookies(session, trustGoyan);
    await change({ ...sessionCookie, domain: ".goyan.fr", hostOnly: false });
    expect(set.mock.calls[0]?.[0]).toMatchObject({ url: "https://goyan.fr/", domain: ".goyan.fr" });
  });

  it.each([
    ["an already persistent cookie", { ...sessionCookie, session: false }, false],
    ["an untrusted site", { ...sessionCookie, domain: "tracker.example.com" }, false],
    ["a removed cookie", sessionCookie, true],
  ])("leaves %s alone", async (_label, cookie, removed) => {
    const { session, change, set } = fakeSession();
    persistSessionCookies(session, trustGoyan);
    await change(cookie, removed);
    expect(set).not.toHaveBeenCalled();
  });
});
