import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import {
  controlsOf,
  mediaSchema,
  muteAll,
  onControlsChange,
  resetControls,
  sendCommand,
  unreadSchema,
  updateControls,
} from "../src/main/workadventure-controls.js";

function fakeContent(): { content: WebContents; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn();
  return { content: { send } as unknown as WebContents, send };
}

describe("workadventure controls", () => {
  it("sends nothing until WorkAdventure registered its toggles", () => {
    const { content, send } = fakeContent();
    sendCommand(content, "toggle-microphone");
    expect(send).not.toHaveBeenCalled();

    updateControls(content, { ready: true });
    sendCommand(content, "toggle-microphone");
    expect(send).toHaveBeenCalledWith("content:command", "toggle-microphone");
  });

  it("turns off what is on when stepping away, and never turns anything on", () => {
    const { content, send } = fakeContent();
    updateControls(content, { ready: true, media: { microphone: true, camera: false } });

    muteAll(content);

    expect(send.mock.calls).toEqual([["content:command", "toggle-microphone"]]);
  });

  it("notifies the listener and starts over after a new page load", () => {
    const { content } = fakeContent();
    const listener = vi.fn();
    onControlsChange(listener);

    updateControls(content, { ready: true, unread: 3 });
    expect(listener).toHaveBeenLastCalledWith(content, expect.objectContaining({ ready: true, unread: 3 }));

    resetControls(content);
    expect(controlsOf(content)).toEqual({ ready: false, media: { microphone: false, camera: false }, unread: 0 });
  });

  it("rejects malformed values coming from the page", () => {
    expect(mediaSchema.safeParse({ microphone: "yes", camera: false }).success).toBe(false);
    expect(unreadSchema.safeParse(-1).success).toBe(false);
    expect(unreadSchema.safeParse(2.5).success).toBe(false);
    expect(unreadSchema.safeParse(12).success).toBe(true);
  });
});
