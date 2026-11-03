import { byId, query } from "../dom.js";

export interface DeviceCheck {
  stop(): void;
}

/** Camera preview and microphone level meter, so devices are checked before entering. */
export function setupDeviceCheck({ onError }: { onError: (message: string) => void }): DeviceCheck {
  const button = byId("devices", HTMLButtonElement);
  const video = byId("preview", HTMLVideoElement);
  const preview = query(document, ".preview", HTMLDivElement);
  const meter = byId("meter-level", HTMLSpanElement);

  let capture: { stream: MediaStream; audio: AudioContext; frame: number } | undefined;

  const stop = (): void => {
    if (!capture) return;
    cancelAnimationFrame(capture.frame);
    capture.stream.getTracks().forEach((track) => track.stop());
    void capture.audio.close();
    capture = undefined;
    video.srcObject = null;
    preview.dataset["active"] = "false";
    meter.style.setProperty("--level", "0");
    button.textContent = "Tester caméra et micro";
  };

  const start = async (): Promise<void> => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    audio.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const drawLevel = (): void => {
      analyser.getByteTimeDomainData(samples);
      const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample - 128)), 0) / 128;
      meter.style.setProperty("--level", peak.toFixed(2));
      if (capture) capture.frame = requestAnimationFrame(drawLevel);
    };

    capture = { stream, audio, frame: requestAnimationFrame(drawLevel) };
    video.srcObject = stream;
    preview.dataset["active"] = "true";
    button.textContent = "Couper";
  };

  button.addEventListener("click", () => {
    if (capture) return stop();
    start().catch(() => onError("Caméra ou micro inaccessible : vérifie les autorisations du système."));
  });

  return { stop };
}
