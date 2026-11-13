// Preload of the hidden music capture page (src/main/music-capture.ts): sends its measures of the sound, nothing else.
import electron = require("electron");
import type { MusicCaptureApi, MusicCaptureChannel, MusicCaptureFrame } from "../shared/music-capture-api.js";

const api: MusicCaptureApi = {
  frame: (frame: MusicCaptureFrame) => electron.ipcRenderer.send("music-capture:frame" satisfies MusicCaptureChannel, frame),
};

electron.contextBridge.exposeInMainWorld("musicCaptureBridge", api);
