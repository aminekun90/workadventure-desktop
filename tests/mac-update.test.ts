import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pickZip, prepareUpdate, replaceableBundle } from "../src/main/mac-update.js";

const IS_MAC = process.platform === "darwin";

describe("pickZip", () => {
  const files = [
    { url: "WorkAdventure-0.2.0-arm64.dmg", sha512: "a" },
    { url: "WorkAdventure-0.2.0-arm64.zip", sha512: "b" },
    { url: "WorkAdventure-0.2.0-x64.zip", sha512: "c" },
  ];

  it("picks the zip built for the running CPU", () => {
    expect(pickZip(files, "x64")?.sha512).toBe("c");
    expect(pickZip(files, "arm64")?.sha512).toBe("b");
  });

  it("finds nothing for an architecture that was not built", () => {
    expect(pickZip(files, "ia32")).toBeUndefined();
  });
});

describe("with a fake install folder", () => {
  let root: string;
  let bundle: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wa-mac-update-"));
    bundle = join(root, "Applications", "WorkAdventure.app");
    mkdirSync(join(bundle, "Contents", "MacOS"), { recursive: true });
  });

  afterEach(() => {
    chmodSync(join(root, "Applications"), 0o755);
    rmSync(root, { recursive: true, force: true });
  });

  describe("replaceableBundle", () => {
    it("returns the .app of the running executable when its folder is writable", () => {
      expect(replaceableBundle(join(bundle, "Contents", "MacOS", "WorkAdventure"))).toBe(bundle);
    });

    it("refuses a read-only location (DMG, translocated app)", () => {
      chmodSync(join(root, "Applications"), 0o555);
      expect(replaceableBundle(join(bundle, "Contents", "MacOS", "WorkAdventure"))).toBeUndefined();
    });

    it("refuses an executable outside an .app bundle", () => {
      expect(replaceableBundle("/usr/local/bin/electron")).toBeUndefined();
    });
  });

  describe("prepareUpdate", () => {
    const serve = (bytes: Buffer) => async (): Promise<Response> => new Response(new Uint8Array(bytes));
    const sha512 = (bytes: Buffer): string => createHash("sha512").update(bytes).digest("base64");

    it("rejects a download whose checksum does not match the manifest", async () => {
      const zip = Buffer.from("not the published zip");
      await expect(
        prepareUpdate({
          version: "0.2.0",
          file: { url: "WorkAdventure-0.2.0-arm64.zip", sha512: sha512(Buffer.from("published zip")), size: zip.length },
          bundle,
          fetch: serve(zip),
          onProgress: () => undefined,
        }),
      ).rejects.toThrow(/checksum mismatch/);
    });

    it.runIf(IS_MAC)("unpacks the verified zip next to the running app, reporting progress", async () => {
      const source = join(root, "build");
      mkdirSync(join(source, "WorkAdventure.app", "Contents"), { recursive: true });
      writeFileSync(join(source, "WorkAdventure.app", "Contents", "version.txt"), "0.2.0");
      const zipPath = join(root, "update.zip");
      execFileSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", join(source, "WorkAdventure.app"), zipPath]);
      const zip = readFileSync(zipPath);
      const progress: number[] = [];

      const prepared = await prepareUpdate({
        version: "0.2.0",
        file: { url: "WorkAdventure-0.2.0-arm64.zip", sha512: sha512(zip), size: zip.length },
        bundle,
        fetch: serve(zip),
        onProgress: (percent) => progress.push(percent),
      });

      expect(prepared.bundle).toBe(bundle);
      expect(prepared.newBundle).toBe(join(root, "Applications", ".WorkAdventure-update", "WorkAdventure.app"));
      expect(readFileSync(join(prepared.newBundle, "Contents", "version.txt"), "utf8")).toBe("0.2.0");
      expect(progress.at(-1)).toBe(100);
      expect(existsSync(bundle)).toBe(true);
    });
  });
});
