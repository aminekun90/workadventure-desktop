// Evaluates an expression in a running app target, over the Chrome DevTools Protocol.
// Usage: node scripts/dev/cdp-eval.mjs '<expression>' [urlFilter]
//   Pages (launcher, toolbar, about, WA view): app started with --remote-debugging-port=9333.
//   Main process: CDP_PORT=9229 with --inspect=9229 (use process.mainModule.require("electron")).
const [expression, urlFilter = ""] = process.argv.slice(2);
const port = process.env.CDP_PORT ?? "9333";
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(({ type, url }) => (type === "page" || type === "node") && url.includes(urlFilter));
if (!target) throw new Error(`No target matching "${urlFilter}" on port ${port}`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve));
socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
const { result } = await new Promise((resolve) => socket.addEventListener("message", ({ data }) => resolve(JSON.parse(data))));
socket.close();
process.stdout.write(`${JSON.stringify(result.exceptionDetails ?? result.result.value, null, 2)}\n`);
