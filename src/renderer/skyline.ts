/**
 * Draws the pixel office skyline into an empty `<svg class="skyline">`. The layout is fixed (same city
 * at every launch); lit windows switch on one after another, timed by the `--delay` custom property.
 * Both skies are drawn: theme.css shows the sun and the drifting clouds by day (light palette), the moon and the
 * twinkling stars by night (every other palette).
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

/** The pixel sun and moon, row by row: [offset from its left side, width]. A disc 10 pixels wide. */
const SUN_ROWS: readonly [number, number][] = [
  [3, 4], [1, 8], [1, 8], [0, 10], [0, 10], [0, 10], [0, 10], [1, 8], [1, 8], [3, 4],
];
/** Stars per city, placed by the seeded generator in the sky above the roofs; one in TWINKLE_EVERY twinkles. */
const STARS = 16;
const STAR_SKY_HEIGHT = 16;
const TWINKLE_EVERY = 3;
/** Craters of the full moon: [x, y, width] from its top-left corner, inside the disc of SUN_ROWS. */
const MOON_CRATERS: readonly [number, number, number][] = [[2, 2, 2], [6, 4, 1], [3, 6, 2], [6, 7, 1]];

/** Where the sun (or the moon) rises in a city: above its lowest roofs (x 26 to 44). */
const SUN_X = 30;
/** Clouds of one city: [x, y, speed in pixels per second]; each is three overlapping blocks, drifting east. */
const CLOUDS: readonly [number, number, number][] = [[62, 7, 1.6], [104, 3, 1.1], [196, 9, 1.35]];
const CLOUD_WIDTH = 16;

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
    // Over the gap between the low buildings of the last city, so they rise clear of the roofs.
    drawSun(svg, (copies - 1) * WIDTH + SUN_X, 5);
    drawMoon(svg, (copies - 1) * WIDTH + SUN_X, 5);
    for (let copy = 0; copy < copies; copy++) drawStars(svg, copy * WIDTH, seededRandom(31 + copy));
    for (let copy = 0; copy < copies; copy++) {
      for (const [x, y, speed] of CLOUDS) drawCloud(svg, { x: copy * WIDTH + x, y, speed, skyWidth: WIDTH * copies });
    }
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

/** A pixel sun rising behind the buildings; its glow comes from theme.css. */
function drawSun(svg: SVGSVGElement, x: number, y: number): void {
  svg.append(disc({ x, y, className: "sun" }));
}

/** A pixel full moon with a few craters; its glow comes from theme.css. */
function drawMoon(svg: SVGSVGElement, x: number, y: number): void {
  const moon = disc({ x, y, className: "moon" });
  for (const [cx, cy, width] of MOON_CRATERS) {
    moon.append(rect({ x: x + cx, y: y + cy, width, height: 1, className: "crater" }));
  }
  svg.append(moon);
}

/** The round pixel disc of SUN_ROWS, as a group so that a glow (CSS filter) follows its round shape. */
function disc({ x, y, className }: { x: number; y: number; className: string }): SVGGElement {
  const group = document.createElementNS(SVG, "g");
  group.setAttribute("class", className);
  SUN_ROWS.forEach(([offset, width], row) => {
    group.append(rect({ x: x + offset, y: y + row, width, height: 1, className: "disc" }));
  });
  return group;
}

function drawStars(svg: SVGSVGElement, offsetX: number, random: () => number): void {
  for (let index = 0; index < STARS; index++) {
    const star = rect({
      x: offsetX + Math.floor(random() * WIDTH),
      y: 1 + Math.floor(random() * STAR_SKY_HEIGHT),
      width: 1,
      height: 1,
      className: index % TWINKLE_EVERY === 0 ? "star twinkle" : "star",
    });
    if (index % TWINKLE_EVERY === 0) star.style.setProperty("--delay", `${(random() * 4).toFixed(2)}s`);
    svg.append(star);
  }
}

/**
 * A cloud crossing the whole sky from west to east, then coming back from the west. It starts where it is placed: its
 * animation is shifted (negative delay) by the time it would have taken to get there.
 */
function drawCloud(svg: SVGSVGElement, cloud: { x: number; y: number; speed: number; skyWidth: number }): void {
  const group = document.createElementNS(SVG, "g");
  group.setAttribute("class", "cloud-drift");
  const travel = cloud.skyWidth + CLOUD_WIDTH;
  const duration = travel / cloud.speed;
  group.style.setProperty("--travel", `${travel}px`);
  group.style.setProperty("--duration", `${duration.toFixed(1)}s`);
  group.style.setProperty("--delay", `${(-((cloud.x + CLOUD_WIDTH) / travel) * duration).toFixed(1)}s`);
  group.append(
    rect({ x: -CLOUD_WIDTH, y: cloud.y + 2, width: CLOUD_WIDTH, height: 3, className: "cloud" }),
    rect({ x: -CLOUD_WIDTH + 3, y: cloud.y, width: 7, height: 3, className: "cloud" }),
    rect({ x: -CLOUD_WIDTH + 9, y: cloud.y + 1, width: 5, height: 2, className: "cloud" }),
  );
  svg.append(group);
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
