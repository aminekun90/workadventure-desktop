import { describe, expect, it } from "vitest";
import { bandEnergy, MusicAnalysis } from "../src/renderer/music-capture/analysis.js";
import { CapturedMusicFrames } from "../src/main/music-frames.js";
import type { SpotifyPlaybackState } from "../src/shared/content-api.js";

const quiet = { bass: 0.2, mid: 0.2, treble: 0.1, decibels: -30 };
const kick = { bass: 0.6, mid: 0.2, treble: 0.1, decibels: -12 };

describe("music analysis of the sound heard", () => {
  it("hears a kick when the bass rises well above its recent level, at most every 250 ms", () => {
    const analysis = new MusicAnalysis();
    for (let time = 0; time < 1000; time += 33) expect(analysis.measure(quiet, time).beat).toBe(false);
    expect(analysis.measure(kick, 1000).beat).toBe(true);
    expect(analysis.measure(kick, 1100).beat).toBe(false);
  });

  it("ignores rises in silence, and keeps every value between 0 and 1", () => {
    const analysis = new MusicAnalysis();
    for (let time = 0; time < 1000; time += 33) analysis.measure({ bass: 0.01, mid: 0, treble: 0, decibels: -80 }, time);
    const frame = analysis.measure({ bass: 0.05, mid: 0, treble: 0, decibels: -70 }, 1000);
    expect(frame.beat).toBe(false);
    for (const value of [frame.level, frame.attack, frame.brightness]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("averages the energy of the bins of a frequency band", () => {
    const bins = new Uint8Array(1024).fill(0);
    bins.fill(255, 0, 8);
    expect(bandEnergy(bins, 48000, 0, 160)).toBeCloseTo(1, 1);
    expect(bandEnergy(bins, 48000, 2000, 10000)).toBe(0);
  });
});

describe("frames for the lights from the sound heard", () => {
  const playing: SpotifyPlaybackState = {
    track: { uri: "spotify:track:abc", title: "", artist: "", artworkUrl: "" },
    playing: true,
    positionMs: 10_000,
    durationMs: 200_000,
    volume: 1,
    shuffle: false,
    repeat: 0,
  };
  const measure = { level: 0.8, attack: 0.5, brightness: 0.3, beat: false };

  it("places each kick where it was heard in the track, and a bar every four kicks", () => {
    const frames = new CapturedMusicFrames();
    const first = frames.frameOf({ ...measure, beat: true }, playing, 0, 500);
    expect(first).toEqual({ uri: "spotify:track:abc", beatStartMs: 10_500, intensity: 0.8, attack: 0.5, brightness: 0.3, barStartMs: 10_500 });
    for (const at of [1000, 1500, 2000]) frames.frameOf({ ...measure, beat: true }, playing, 0, at);
    const fifth = frames.frameOf({ ...measure, beat: true }, playing, 0, 2500);
    expect(fifth?.beatStartMs).toBe(12_500);
    expect(fifth?.barStartMs).toBe(12_500);
    expect(frames.frameOf(measure, playing, 0, 2600)?.beatStartMs).toBe(12_500);
  });

  it("gives nothing while Spotify is paused or plays no track", () => {
    const frames = new CapturedMusicFrames();
    expect(frames.frameOf(measure, { ...playing, playing: false }, 0, 0)).toBeNull();
    expect(frames.frameOf(measure, { ...playing, track: null }, 0, 0)).toBeNull();
    expect(frames.frameOf(measure, null, 0, 0)).toBeNull();
  });
});
