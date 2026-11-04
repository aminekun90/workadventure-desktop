import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadDiskImage, locateBundle, pickDmg, pickZip, prepareUpdate } from "../src/main/mac-update.js";

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

  it("picks the disk image built for the running CPU", () => {
    expect(pickDmg(files, "arm64")?.sha512).toBe("a");
    expect(pickDmg(files, "x64")).toBeUndefined();
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

  describe("locateBundle", () => {
    it("replaces the .app of the running executable in place when its folder is writable", () => {
      expect(locateBundle(join(bundle, "Contents", "MacOS", "WorkAdventure"))).toEqual({ kind: "writable", bundle });
    });

    it("needs an administrator password when the folder is not writable (standard account, managed Mac)", () => {
      chmodSync(join(root, "Applications"), 0o555);
      expect(locateBundle(join(bundle, "Contents", "MacOS", "WorkAdventure"))).toEqual({ kind: "admin", bundle });
    });

    it("cannot replace an app run from its disk image or translocated by Gatekeeper", () => {
      const fromDmg = "/Volumes/WorkAdventure 0.2.0/WorkAdventure.app";
      const translocated = "/private/var/folders/x/y/T/AppTranslocation/ABC/d/WorkAdventure.app";
      expect(locateBundle(`${fromDmg}/Contents/MacOS/WorkAdventure`)).toEqual({ kind: "read-only", bundle: fromDmg });
      expect(locateBundle(`${translocated}/Contents/MacOS/WorkAdventure`)).toEqual({ kind: "read-only", bundle: translocated });
    });

    it("ignores an executable outside an .app bundle", () => {
      expect(locateBundle("/usr/local/bin/electron")).toBeUndefined();
    });
  });

  describe("downloadDiskImage", () => {
    const sha512 = (bytes: Buffer): string => createHash("sha512").update(bytes).digest("base64");
    const file = (bytes: Buffer) => ({ url: "WorkAdventure-0.2.0-arm64.dmg", sha512: sha512(bytes), size: bytes.length });

    it("saves the verified disk image in the given folder", async () => {
      const dmg = Buffer.from("published dmg");
      const path = await downloadDiskImage({
        version: "0.2.0",
        file: file(dmg),
        directory: root,
        fetch: async () => new Response(new Uint8Array(dmg)),
        onProgress: () => undefined,
      });
      expect(path).toBe(join(root, "WorkAdventure-0.2.0-arm64.dmg"));
      expect(readFileSync(path, "utf8")).toBe("published dmg");
    });

    it("leaves nothing behind when the checksum does not match", async () => {
      await expect(
        downloadDiskImage({
          version: "0.2.0",
          file: file(Buffer.from("published dmg")),
          directory: root,
          fetch: async () => new Response(new Uint8Array(Buffer.from("tampered"))),
          onProgress: () => undefined,
        }),
      ).rejects.toThrow(/checksum mismatch/);
      expect(existsSync(join(root, "WorkAdventure-0.2.0-arm64.dmg"))).toBe(false);
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
      expect(prepared.asAdministrator).toBe(false);
      expect(prepared.newBundle).toBe(join(root, "Applications", ".WorkAdventure-update", "WorkAdventure.app"));
      expect(readFileSync(join(prepared.newBundle, "Contents", "version.txt"), "utf8")).toBe("0.2.0");
      expect(progress.at(-1)).toBe(100);
      expect(existsSync(bundle)).toBe(true);
    });

    it.runIf(IS_MAC)("unpacks outside a folder this account cannot write, for a swap with a password", async () => {
      const source = join(root, "build");
      mkdirSync(join(source, "WorkAdventure.app", "Contents"), { recursive: true });
      const zipPath = join(root, "update.zip");
      execFileSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", join(source, "WorkAdventure.app"), zipPath]);
      const zip = readFileSync(zipPath);
      chmodSync(join(root, "Applications"), 0o555);

      const prepared = await prepareUpdate({
        version: "0.2.0",
        file: { url: "WorkAdventure-0.2.0-arm64.zip", sha512: sha512(zip), size: zip.length },
        bundle,
        asAdministrator: true,
        fetch: serve(zip),
        onProgress: () => undefined,
      });

      expect(prepared.asAdministrator).toBe(true);
      expect(prepared.newBundle.startsWith(join(root, "Applications"))).toBe(false);
      expect(existsSync(prepared.newBundle)).toBe(true);
      rmSync(join(prepared.newBundle, ".."), { recursive: true, force: true });
    });
  });
});
