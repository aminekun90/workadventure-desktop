/** The hidden music capture page (src/main/music-capture.ts) and main: what the analysis of the system audio gives. */
export const MUSIC_CAPTURE_CHANNELS = {
  /** Page → main: one measure of the sound, about 30 times a second. */
  frame: "music-capture:frame",
} as const;
export type MusicCaptureChannel = (typeof MUSIC_CAPTURE_CHANNELS)[keyof typeof MUSIC_CAPTURE_CHANNELS];

/** Each value between 0 and 1; `beat` when a kick rises above the recent bass. */
export interface MusicCaptureFrame {
  level: number;
  attack: number;
  brightness: number;
  beat: boolean;
}

export interface MusicCaptureApi {
  frame: (frame: MusicCaptureFrame) => void;
}
