import type { MusicCaptureFrame } from "../../shared/music-capture-api.js";

/** About one second of measures at 30 a second: what "the recent bass" means for a kick. */
const HISTORY = 30;
/** A kick: the bass rises this much above its recent average. */
const BEAT_RATIO = 1.45;
/** Quieter than this, a rise is noise, not a kick. */
const BEAT_FLOOR = 0.12;
/** No two kicks closer than this (240 BPM). */
const MIN_BEAT_INTERVAL_MS = 250;

export interface Bands {
  bass: number;
  mid: number;
  treble: number;
  /** Loudness of the whole signal, in dBFS. */
  decibels: number;
}

/** Turns successive band energies into light: loudness, kicks on the bass, brightness from the treble. */
export class MusicAnalysis {
  private readonly bassHistory: number[] = [];
  private lastBeatAt = -Infinity;

  public measure(bands: Bands, now: number): MusicCaptureFrame {
    const average = this.bassHistory.length ? this.bassHistory.reduce((sum, value) => sum + value, 0) / this.bassHistory.length : 0;
    const rise = average > 0 ? bands.bass / average : 0;
    const beat = bands.bass > BEAT_FLOOR && rise > BEAT_RATIO && now - this.lastBeatAt >= MIN_BEAT_INTERVAL_MS;
    if (beat) this.lastBeatAt = now;
    if (this.bassHistory.length >= HISTORY) this.bassHistory.shift();
    this.bassHistory.push(bands.bass);
    const total = bands.bass + bands.mid + bands.treble;
    return {
      level: unit((bands.decibels + 50) / 50),
      attack: unit((rise - 1) / 2),
      brightness: total > 0 ? unit((bands.treble / total) * 3) : 0,
      beat,
    };
  }
}

/** Average energy (0 to 1) of the frequency bins between two frequencies. */
export function bandEnergy(bins: Uint8Array, sampleRate: number, from: number, to: number): number {
  const hzPerBin = sampleRate / 2 / bins.length;
  const start = Math.max(0, Math.floor(from / hzPerBin));
  const end = Math.min(bins.length, Math.ceil(to / hzPerBin));
  if (end <= start) return 0;
  let sum = 0;
  for (let index = start; index < end; index++) sum += bins[index] ?? 0;
  return sum / (end - start) / 255;
}

function unit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
