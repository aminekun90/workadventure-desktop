// The hidden music capture page: listens to what this computer plays (system audio) and measures it for the lights.
// Nothing leaves this page but numbers: no sound is recorded or sent.
import type { MusicCaptureApi } from "../../shared/music-capture-api.js";
import { bandEnergy, MusicAnalysis } from "./analysis.js";

declare global {
  interface Window {
    musicCaptureBridge: MusicCaptureApi;
    startMusicCapture: () => Promise<boolean>;
  }
}

const MEASURE_INTERVAL_MS = 33;

/** Called by main with a user activation (getDisplayMedia needs one); main grants the system audio only. */
window.startMusicCapture = async (): Promise<boolean> => {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  // The screen comes with the sound: it is not looked at.
  for (const track of stream.getVideoTracks()) track.stop();
  if (stream.getAudioTracks().length === 0) return false;
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.5;
  context.createMediaStreamSource(stream).connect(analyser);
  const bins = new Uint8Array(analyser.frequencyBinCount);
  const samples = new Float32Array(analyser.fftSize);
  const analysis = new MusicAnalysis();
  setInterval(() => {
    analyser.getByteFrequencyData(bins);
    analyser.getFloatTimeDomainData(samples);
    let power = 0;
    for (const sample of samples) power += sample * sample;
    const decibels = 10 * Math.log10(power / samples.length || 1e-10);
    window.musicCaptureBridge.frame(
      analysis.measure(
        {
          bass: bandEnergy(bins, context.sampleRate, 30, 150),
          mid: bandEnergy(bins, context.sampleRate, 150, 2000),
          treble: bandEnergy(bins, context.sampleRate, 2000, 10000),
          decibels,
        },
        performance.now(),
      ),
    );
  }, MEASURE_INTERVAL_MS);
  return true;
};
