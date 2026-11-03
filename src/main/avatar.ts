import { z } from "zod";
import { readJsonFile, writeJsonFile } from "./json-file.js";

/** Layer sprite sheets are small PNGs (~4 KB): anything bigger is not a woka layer. */
const MAX_LAYER_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5000;

/**
 * Runs inside the WorkAdventure page: resolves the woka layers picked by the user (ids in
 * localStorage) to their sprite sheet URLs, bottom layer first. The auth token never leaves the page.
 */
export const READ_AVATAR_SCRIPT = `(async () => {
  const ids = JSON.parse(localStorage.getItem("characterTextures") ?? "[]");
  if (ids.length === 0) return [];
  const response = await fetch("/woka/list?roomUrl=" + encodeURIComponent(location.pathname), {
    headers: { Authorization: localStorage.getItem("authToken") ?? "" },
  });
  if (!response.ok) throw new Error("woka list HTTP " + response.status);
  const layers = Object.values(await response.json());
  return layers.flatMap((layer) => layer.collections.flatMap((collection) => collection.textures))
    .filter((texture) => ids.includes(texture.id))
    .map((texture) => texture.url);
})()`;

const layerUrlsSchema = z.array(z.url({ protocol: /^https$/ })).max(10);

const avatarSchema = z.object({
  /** Sprite sheets as data URLs, bottom layer first: available offline, no remote load in the launcher. */
  layers: z.array(z.string().startsWith("data:image/png;base64,")).min(1),
});
export type Avatar = z.infer<typeof avatarSchema>;

type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

export interface AvatarSource {
  /** Result of READ_AVATAR_SCRIPT: untrusted, it comes from a remote page. */
  layerUrls: unknown;
  isTrusted: (url: string) => boolean;
  fetch: Fetch;
}

/** Downloads the layers; undefined when the user has no custom woka yet. */
export async function downloadAvatar({ layerUrls, isTrusted, fetch }: AvatarSource): Promise<Avatar | undefined> {
  const urls = layerUrlsSchema.parse(layerUrls);
  if (urls.length === 0) return undefined;
  const untrusted = urls.find((url) => !isTrusted(url));
  if (untrusted) throw new Error(`Avatar layer from an untrusted origin: ${untrusted}`);
  return { layers: await Promise.all(urls.map((url) => downloadPng(url, fetch))) };
}

/** The last captured avatar; undefined until a room has been visited (the launcher then shows a default). */
export function loadAvatar(filePath: string): Avatar | undefined {
  const result = avatarSchema.safeParse(readJsonFile(filePath));
  return result.success ? result.data : undefined;
}

export function saveAvatar(filePath: string, avatar: Avatar): void {
  writeJsonFile(filePath, avatar);
}

async function downloadPng(url: string, fetch: Fetch): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Avatar layer HTTP ${response.status}: ${url}`);
  if (response.headers.get("content-type") !== "image/png") throw new Error(`Avatar layer is not a PNG: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_LAYER_BYTES) throw new Error(`Avatar layer too large (${bytes.byteLength} B): ${url}`);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}
