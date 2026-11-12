import type { AnnotationApi, AnnotationTool } from "../../shared/annotation-api.js";
import { byId } from "../dom.js";

declare global {
  interface Window {
    /** Exposed by src/preload/annotation.cts. */
    annotationBridge: AnnotationApi;
  }
}

/** How long the laser's trail stays on screen. */
const LASER_LIFETIME_MS = 900;
const PEN_WIDTH = 4;
const LASER_WIDTH = 6;

interface Point {
  x: number;
  y: number;
  time: number;
}

const canvas = byId("canvas", HTMLCanvasElement);
const context = canvas.getContext("2d");
if (!context) throw new Error("Annotation canvas has no 2D context");
const colors = getComputedStyle(document.documentElement);
const PEN_COLOR = colors.getPropertyValue("--alert").trim();
const LASER_COLOR = colors.getPropertyValue("--window-light").trim();

let tool: AnnotationTool = "mouse";
let strokes: Point[][] = [];
let current: Point[] | undefined;
let laser: Point[] = [];
let animating = false;

window.annotationBridge.onCommand((command) => {
  if ("tool" in command) {
    tool = command.tool;
    document.body.dataset["tool"] = tool;
    current = undefined;
  } else if (command.action === "clear") {
    strokes = [];
    laser = [];
    render();
  }
});

canvas.addEventListener("pointerdown", (event) => {
  if (tool !== "pen") return;
  canvas.setPointerCapture(event.pointerId);
  current = [pointOf(event)];
  strokes = [...strokes, current];
  render();
});

canvas.addEventListener("pointermove", (event) => {
  if (tool === "pen" && current) {
    current.push(pointOf(event));
    render();
  } else if (tool === "laser") {
    laser = [...laser, pointOf(event)];
    animate();
  }
});

canvas.addEventListener("pointerup", () => (current = undefined));
canvas.addEventListener("pointercancel", () => (current = undefined));
window.addEventListener("resize", resize);
resize();

function pointOf(event: PointerEvent): Point {
  return { x: event.clientX, y: event.clientY, time: performance.now() };
}

/** Sharp lines on high-density screens: the canvas has as many pixels as the screen. */
function resize(): void {
  const scale = window.devicePixelRatio;
  canvas.width = Math.round(window.innerWidth * scale);
  canvas.height = Math.round(window.innerHeight * scale);
  context?.setTransform(scale, 0, 0, scale, 0, 0);
  render();
}

/** The laser fades out frame by frame, then the loop stops until it moves again. */
function animate(): void {
  if (animating) return;
  animating = true;
  const frame = (): void => {
    render();
    if (laser.length > 0) requestAnimationFrame(frame);
    else animating = false;
  };
  requestAnimationFrame(frame);
}

function render(): void {
  if (!context) return;
  context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = 1;
  context.strokeStyle = PEN_COLOR;
  context.lineWidth = PEN_WIDTH;
  for (const stroke of strokes) drawLine(stroke);
  const now = performance.now();
  laser = laser.filter((point) => now - point.time < LASER_LIFETIME_MS);
  context.strokeStyle = LASER_COLOR;
  context.lineWidth = LASER_WIDTH;
  for (let index = 1; index < laser.length; index += 1) {
    const from = laser[index - 1];
    const to = laser[index];
    if (!from || !to) continue;
    context.globalAlpha = 1 - (now - to.time) / LASER_LIFETIME_MS;
    drawLine([from, to]);
  }
  const tip = laser.at(-1);
  if (tip) {
    context.globalAlpha = 1;
    context.fillStyle = LASER_COLOR;
    context.beginPath();
    context.arc(tip.x, tip.y, LASER_WIDTH, 0, Math.PI * 2);
    context.fill();
  }
}

function drawLine(points: Point[]): void {
  const [first, ...rest] = points;
  if (!context || !first) return;
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const point of rest) context.lineTo(point.x, point.y);
  if (rest.length === 0) context.lineTo(first.x + 0.1, first.y);
  context.stroke();
}
