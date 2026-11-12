// Preload of the annotation overlay (src/main/annotation-window.ts): receives the meeting bar's tools, nothing else.
import electron = require("electron");
import type { AnnotationApi, AnnotationChannel, AnnotationCommand } from "../shared/annotation-api.js";

const api: AnnotationApi = {
  onCommand: (listener) => {
    electron.ipcRenderer.on("annotation:command" satisfies AnnotationChannel, (_event, command: AnnotationCommand) => listener(command));
  },
  release: () => electron.ipcRenderer.send("annotation:release" satisfies AnnotationChannel),
};

electron.contextBridge.exposeInMainWorld("annotationBridge", api);
