import { describe, expect, it } from "vitest";
import { describeUpdateError, isReleaseInProgress } from "../src/main/update-errors.js";

describe("describeUpdateError", () => {
  it.each([
    ["net::ERR_INTERNET_DISCONNECTED", "pas de connexion à Internet"],
    ["getaddrinfo ENOTFOUND github.com", "pas de connexion à Internet"],
    ["net::ERR_CERT_AUTHORITY_INVALID", "certificat refusé, un proxy d'entreprise intercepte peut-être la connexion"],
    ["self signed certificate in certificate chain", "certificat refusé, un proxy d'entreprise intercepte peut-être la connexion"],
    ["net::ERR_TUNNEL_CONNECTION_FAILED", "le proxy a refusé la connexion à GitHub"],
    ["net::ERR_CONNECTION_TIMED_OUT", "GitHub n'a pas répondu à temps"],
    ["net::ERR_CONNECTION_RESET", "connexion à GitHub interrompue"],
    ["HttpError: 429 Too Many Requests", "GitHub limite temporairement les requêtes"],
    ["HttpError: 502 Bad Gateway", "GitHub est momentanément indisponible"],
  ])("explains %s", (message, reason) => {
    expect(describeUpdateError(new Error(message))).toBe(reason);
  });

  it("points to the logs for anything else", () => {
    expect(describeUpdateError(new Error("Cannot parse releases feed"))).toBe("erreur inattendue, détails dans les logs");
  });
});

describe("isReleaseInProgress", () => {
  it("recognizes a release whose update manifest is not uploaded yet", () => {
    const error = Object.assign(new Error("Cannot find latest-mac.yml in the latest release artifacts"), {
      code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
    });
    expect(isReleaseInProgress(error)).toBe(true);
  });

  it("does not hide real failures", () => {
    expect(isReleaseInProgress(new Error("net::ERR_INTERNET_DISCONNECTED"))).toBe(false);
  });
});
