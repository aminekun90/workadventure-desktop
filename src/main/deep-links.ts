/**
 * `workadventure://` links open a room in the app, e.g. pasted in a chat or a calendar invite:
 * workadventure://wa.goyan.fr/~/goyan/office.wam → https://wa.goyan.fr/~/goyan/office.wam
 */
export const DEEP_LINK_PROTOCOL = "workadventure";

/** The https room URL of a deep link, or undefined when it is malformed or points outside trusted sites. */
export function deepLinkTarget(link: string, isTrusted: (url: string) => boolean): string | undefined {
  const parsed = URL.parse(link);
  if (!parsed || parsed.protocol !== `${DEEP_LINK_PROTOCOL}:` || !parsed.host) return undefined;
  const target = `https://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  return isTrusted(target) ? target : undefined;
}
