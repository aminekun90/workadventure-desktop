import type { SpotifyMusicFrame, SpotifyPlaybackState } from "../shared/content-api.js";
import { onCapturedMusic } from "./music-capture.js";
import { CapturedMusicFrames } from "./music-frames.js";
import { onSpicetifyMusic, onSpicetifyPlayback, spicetifyMusic, spicetifyPlayback } from "./spicetify-bridge.js";

/**
 * The music of this computer's Spotify for the lights of a Jukebox: the extension's frames when Spotify still gives its
 * analysis, otherwise frames measured from the sound heard. The system audio is only listened to while Spotify plays
 * and gives no analysis, and while the page asks.
 */
export function watchJukeboxMusic(send: (frame: SpotifyMusicFrame | null) => void): () => void {
  let extensionFrame = spicetifyMusic();
  let playback: SpotifyPlaybackState | null = spicetifyPlayback();
  let playbackAt = Date.now();
  const frames = new CapturedMusicFrames();
  let stopCapture: (() => void) | undefined;

  const update = (): void => {
    const listen = extensionFrame === null && playback?.playing === true;
    if (listen && !stopCapture) {
      stopCapture = onCapturedMusic((measure) => {
        if (extensionFrame === null) send(frames.frameOf(measure, playback, playbackAt, Date.now()));
      });
    } else if (!listen && stopCapture) {
      stopCapture();
      stopCapture = undefined;
    }
  };
  const stopMusic = onSpicetifyMusic((frame) => {
    extensionFrame = frame;
    if (frame) send(frame);
    update();
  });
  const stopPlayback = onSpicetifyPlayback((state) => {
    playback = state;
    playbackAt = Date.now();
    if (!state?.playing) send(extensionFrame);
    update();
  });
  send(extensionFrame);
  update();
  return () => {
    stopMusic();
    stopPlayback();
    stopCapture?.();
    stopCapture = undefined;
  };
}
