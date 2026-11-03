/**
 * Turns an update check error into a reason the user can act on. Matching is on Chromium net error
 * codes and HTTP statuses found in the message, which electron-updater passes through.
 */
const REASONS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ENOTFOUND|ERR_NAME_NOT_RESOLVED/, reason: "pas de connexion à Internet" },
  { pattern: /ERR_CERT|certificate|self.signed/i, reason: "certificat refusé, un proxy d'entreprise intercepte peut-être la connexion" },
  { pattern: /ERR_PROXY|ERR_TUNNEL_CONNECTION_FAILED/, reason: "le proxy a refusé la connexion à GitHub" },
  { pattern: /ERR_TIMED_OUT|ETIMEDOUT|ERR_CONNECTION_TIMED_OUT/, reason: "GitHub n'a pas répondu à temps" },
  { pattern: /ERR_CONNECTION_(REFUSED|RESET|CLOSED)|ECONNRESET|ECONNREFUSED/, reason: "connexion à GitHub interrompue" },
  { pattern: /\b(403|429)\b/, reason: "GitHub limite temporairement les requêtes" },
  { pattern: /\b5\d\d\b/, reason: "GitHub est momentanément indisponible" },
];

/**
 * A tag is pushed before CI has uploaded its update manifest: for a few minutes the newest release has no
 * latest*.yml, and electron-updater fails with this code.
 */
export function isReleaseInProgress(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND";
}

export function describeUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return REASONS.find(({ pattern }) => pattern.test(message))?.reason ?? "erreur inattendue, détails dans les logs";
}
