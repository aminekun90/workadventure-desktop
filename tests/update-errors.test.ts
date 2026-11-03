import { describe, expect, it } from "vitest";
import { describeUpdateError } from "../src/main/update-errors.js";

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
