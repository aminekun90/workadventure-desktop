// Screenshots a page of a running app (started with --remote-debugging-port=9333).
// Usage: node scripts/dev/cdp-shot.mjs <urlFilter> <out.png> [clipHeight] [clipWidth]
// Example, the toolbar band only: node scripts/dev/cdp-shot.mjs toolbar /tmp/toolbar.png 44 1440
import { writeFileSync } from "node:fs";

const [urlFilter, out, clipHeight, clipWidth = "1440"] = process.argv.slice(2);
const targets = await (await fetch("http://127.0.0.1:9333/json")).json();
const target = targets.find(({ type, url }) => type === "page" && url.includes(urlFilter));
if (!target) throw new Error(`No page matching "${urlFilter}"`);

const clip = clipHeight && { x: 0, y: 0, width: Number(clipWidth), height: Number(clipHeight), scale: 1 };
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve));
socket.send(JSON.stringify({ id: 1, method: "Page.captureScreenshot", params: { format: "png", ...(clip && { clip }) } }));
const { result } = await new Promise((resolve) => socket.addEventListener("message", ({ data }) => resolve(JSON.parse(data))));
socket.close();
writeFileSync(out, Buffer.from(result.data, "base64"));
