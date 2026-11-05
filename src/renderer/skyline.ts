/**
 * Draws the pixel office skyline into an empty `<svg class="skyline">`. The layout is fixed (same city
 * at every launch); lit windows switch on one after another, timed by the `--delay` custom property.
 */

const SVG = "http://www.w3.org/2000/svg";
const WIDTH = 240;
const HEIGHT = 44;
const GROUND = 4;
const WINDOW_STEP = 3;
const LIGHT_STAGGER_S = 0.035;

/** [x, width, height] in pixels; the far row sits behind the near one. */
const FAR_ROW: readonly [number, number, number][] = [
  [4, 18, 30], [26, 14, 22], [44, 22, 36], [70, 16, 26], [92, 26, 38], [124, 14, 24],
  [142, 20, 34], [166, 16, 28], [186, 24, 37], [214, 22, 27],
];
const NEAR_ROW: readonly [number, number, number][] = [
  [0, 20, 18], [16, 16, 24], [36, 26, 16], [60, 14, 27], [78, 30, 20], [112, 18, 29],
  [134, 26, 17], [164, 14, 25], [182, 22, 19], [206, 16, 26], [224, 16, 15],
];

/**
 * The city is repeated side by side as many times as the shape of the element needs, so that its buildings keep
 * their size and stay whole: a very wide window (full screen) used to enlarge a single city until their tops were
 * cut off. Redrawn when the element changes shape enough to need another number of copies.
 */
export function drawSkyline(svg: SVGSVGElement): void {
  svg.setAttribute("preserveAspectRatio", "xMidYMax slice");
  let copies = 0;
  const render = (): void => {
    const { width, height } = svg.getBoundingClientRect();
    const needed = width > 0 && height > 0 ? Math.max(1, Math.ceil(width / height / (WIDTH / HEIGHT))) : 1;
    if (needed === copies) return;
    copies = needed;
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${WIDTH * copies} ${HEIGHT}`);
    let litCount = 0;
    for (let copy = 0; copy < copies; copy++) {
      // Each copy lights other windows, so the repetition does not show.
      litCount = drawCity(svg, copy * WIDTH, seededRandom(7 + copy), litCount);
    }
    svg.append(rect({ x: 0, y: HEIGHT - GROUND, width: WIDTH * copies, height: GROUND, className: "ground" }));
  };
  render();
  new ResizeObserver(render).observe(svg);
}

/** One city, shifted by `offsetX`. Returns the number of lit windows so far, which staggers their lighting. */
function drawCity(svg: SVGSVGElement, offsetX: number, random: () => number, litSoFar: number): number {
  let litCount = litSoFar;
  for (const [row, buildings] of [["far", FAR_ROW], ["near", NEAR_ROW]] as const) {
    for (const [x, width, height] of buildings) {
      const top = HEIGHT - GROUND - height;
      svg.append(rect({ x: offsetX + x, y: top, width, height, className: row }));
      for (let wy = top + 3; wy < HEIGHT - GROUND - 3; wy += WINDOW_STEP) {
        for (let wx = x + 2; wx < x + width - 2; wx += WINDOW_STEP) {
          const lit = random() < (row === "near" ? 0.32 : 0.18);
          const window = rect({
            x: offsetX + wx,
            y: wy,
            width: 1,
            height: 1,
            className: lit ? "window lit" : "window",
          });
          if (lit) window.style.setProperty("--delay", `${(litCount++ * LIGHT_STAGGER_S).toFixed(3)}s`);
          svg.append(window);
        }
      }
    }
  }
  return litCount;
}

function rect({ x, y, width, height, className }: { x: number; y: number; width: number; height: number; className: string }): SVGRectElement {
  const element = document.createElementNS(SVG, "rect");
  element.setAttribute("x", String(x));
  element.setAttribute("y", String(y));
  element.setAttribute("width", String(width));
  element.setAttribute("height", String(height));
  element.setAttribute("class", className);
  return element;
}

/** Small deterministic generator (mulberry32): the same windows are lit at every launch. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
