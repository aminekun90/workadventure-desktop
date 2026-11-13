import type { SpotifyMusicFrame, SpotifyPlaybackState } from "../shared/content-api.js";
import type { MusicCaptureFrame } from "../shared/music-capture-api.js";

/** Four beats to a bar: most of what plays on a Jukebox. */
const BEATS_PER_BAR = 4;

/**
 * The measures of the sound heard, as the frames the Spicetify extension used to send from Spotify's analysis: the beat
 * and the bar where they were heard in the track (its position), the loudness, the attack and the brightness. WorkAdventure
 * reads them unchanged.
 */
export class CapturedMusicFrames {
  private trackUri: string | undefined;
  private beatStartMs = 0;
  private barStartMs = 0;
  private beats = 0;

  /** `now`: ms since the epoch, to place the beat in the track from the last playback report. */
  public frameOf(measure: MusicCaptureFrame, playback: SpotifyPlaybackState | null, receivedAt: number, now: number): SpotifyMusicFrame | null {
    const uri = playback?.track?.uri;
    if (!playback?.playing || !uri) return null;
    if (uri !== this.trackUri) {
      this.trackUri = uri;
      this.beatStartMs = 0;
      this.barStartMs = 0;
      this.beats = 0;
    }
    if (measure.beat) {
      const position = Math.max(0, Math.round(playback.positionMs + (now - receivedAt)));
      this.beatStartMs = position;
      if (this.beats % BEATS_PER_BAR === 0) this.barStartMs = position;
      this.beats++;
    }
    return {
      uri,
      beatStartMs: this.beatStartMs,
      intensity: measure.level,
      attack: measure.attack,
      brightness: measure.brightness,
      barStartMs: this.barStartMs,
    };
  }
}
