import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type { BrowserWindow } from "electron";
import { z } from "zod";
import { logger } from "./logger.js";

/**
 * Whether a window can be seen on a screen of this Mac, like Teams decides to show its own floating window: visible as
 * long as some part of it is on screen, in front of the other apps' windows. Chromium cannot tell (it only knows a
 * minimized window), and macOS's own occlusion state stays "visible" while anything records the screen, a call
 * included. So the windows on screen are listed (CGWindowListCopyWindowInfo, no permission needed for their bounds)
 * and the window's area is checked against those in front of it.
 */

/** Often enough for the mini window to follow a window switch, cheap enough to run during a whole call. */
const POLL_SECONDS = 0.7;
/** Distance between the points of the window checked: a strip thinner than this left visible may be missed. */
const SAMPLE_STEP = 16;

const windowInfoSchema = z.object({
  id: z.number(),
  pid: z.number(),
  layer: z.number(),
  alpha: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type WindowInfo = z.infer<typeof windowInfoSchema>;
const windowListSchema = z.array(windowInfoSchema);

/**
 * `windows` from front to back, as listed. The window is visible if a point of it is covered by none of the windows in
 * front of it from other apps: this app's own floating windows (mini window, meeting bar, annotations) do not hide it.
 * Absent from the list (minimized, on another desktop, hidden), it is not visible.
 */
export function isWindowVisible(windows: readonly WindowInfo[], windowId: number, ownPid: number): boolean {
  const index = windows.findIndex(({ id }) => id === windowId);
  const target = windows[index];
  if (!target) return false;
  const cover = windows.slice(0, index).filter(({ pid, layer, alpha }) => pid !== ownPid && layer === 0 && alpha > 0);
  const covered = (x: number, y: number): boolean =>
    cover.some((w) => x >= w.x && x < w.x + w.width && y >= w.y && y < w.y + w.height);
  for (const y of samples(target.y, target.height)) {
    for (const x of samples(target.x, target.width)) {
      if (!covered(x, y)) return true;
    }
  }
  return false;
}

/** Every SAMPLE_STEP pixels from the start, and the last pixel: a strip along the far edge counts too. */
function samples(start: number, length: number): number[] {
  if (length <= 0) return [];
  const points = Array.from({ length: Math.ceil(length / SAMPLE_STEP) }, (_, i) => start + i * SAMPLE_STEP);
  return [...points, start + length - 1];
}

// JavaScript for Automation: lists the windows on screen, front to back, until stdin closes (main quits or stops it).
const LIST_WINDOWS = `
ObjC.import("CoreGraphics");
ObjC.import("Foundation");
const out = $.NSFileHandle.fileHandleWithStandardOutput;
while (true) {
  const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, 0))) || [];
  const windows = list.map((w) => ({ id: w.kCGWindowNumber, pid: w.kCGWindowOwnerPID, layer: w.kCGWindowLayer, alpha: w.kCGWindowAlpha,
    x: w.kCGWindowBounds.X, y: w.kCGWindowBounds.Y, width: w.kCGWindowBounds.Width, height: w.kCGWindowBounds.Height }));
  out.writeData($(JSON.stringify(windows) + "\\n").dataUsingEncoding($.NSUTF8StringEncoding));
  delay(${POLL_SECONDS});
}
`;

/**
 * Reports whether the window is visible, on each change, until the returned function is called. macOS only: elsewhere
 * nothing is reported, the page's own visibility (minimized or not) is used.
 */
export function watchWindowVisibility(window: BrowserWindow, report: (visible: boolean) => void): () => void {
  if (process.platform !== "darwin") return () => undefined;
  // "window:<CGWindowID>:0" on macOS.
  const windowId = Number(window.getMediaSourceId().split(":")[1]);
  let last: boolean | undefined;
  let child: ChildProcess | undefined = spawn("osascript", ["-l", "JavaScript", "-e", LIST_WINDOWS], {
    stdio: ["pipe", "pipe", "ignore"],
  });
  child.on("error", (error) => logger.warn({ err: error }, "Cannot watch the window's visibility"));
  if (child.stdout) {
    createInterface({ input: child.stdout }).on("line", (line) => {
      const windows = parseWindows(line);
      if (!windows) return;
      const visible = isWindowVisible(windows, windowId, process.pid);
      if (visible === last) return;
      last = visible;
      report(visible);
    });
  }
  return () => {
    child?.kill();
    child = undefined;
  };
}

function parseWindows(line: string): WindowInfo[] | undefined {
  try {
    const result = windowListSchema.safeParse(JSON.parse(line));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
