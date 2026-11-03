import { desktopCapturer, systemPreferences, type Session } from "electron";
import { logger } from "./logger.js";

const GRANTED_PERMISSIONS = new Set([
  "media",
  "display-capture",
  "notifications",
  "fullscreen",
  "speaker-selection",
  "clipboard-sanitized-write",
]);

/** Allowlist: any permission or origin not listed is denied. */
export function installPermissionHandlers(session: Session, isTrusted: (url: string) => boolean): void {
  session.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin) => GRANTED_PERMISSIONS.has(permission) && isTrusted(requestingOrigin),
  );

  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    if (!GRANTED_PERMISSIONS.has(permission) || !isTrusted(details.requestingUrl)) {
      callback(false);
      return;
    }
    if (permission !== "media" || process.platform !== "darwin" || !("mediaTypes" in details)) {
      callback(true);
      return;
    }
    // macOS also needs the OS-level camera/microphone consent (TCC), asked once.
    const mediaTypes = details.mediaTypes ?? [];
    Promise.all(mediaTypes.map((type) => systemPreferences.askForMediaAccess(type === "video" ? "camera" : "microphone")))
      .then((answers) => callback(answers.every(Boolean)))
      .catch((error: unknown) => {
        logger.warn({ err: error }, "macOS media access request failed");
        callback(false);
      });
  });

  // macOS 15+ shows the native picker; elsewhere the first screen is shared.
  session.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen"] })
        .then(([screen]) => callback(screen ? { video: screen } : {}))
        .catch((error: unknown) => {
          logger.warn({ err: error }, "Screen capture sources unavailable");
          callback({});
        });
    },
    { useSystemPicker: true },
  );
}
