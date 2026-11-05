import type { Choice } from "../../shared/config.js";
import type { LauncherSpaces, ProbeResult } from "../../shared/launcher-api.js";
import type { SpaceRef } from "../../shared/spaces.js";
import { api } from "./bridge.js";
import { byId, query } from "../dom.js";

const REFRESH_INTERVAL_MS = 15_000;
const CUSTOM_PROBE_DELAY_MS = 500;

type StatusState = "idle" | "pending" | "online" | "offline";

export interface InstancePicker {
  selectedChoice(): Choice;
  select(choice: Choice): void;
}

/** A card of the list: one of goyan's spaces or one the user added; both can be removed. */
interface SpaceCard {
  ref: SpaceRef;
  choice: Choice;
  card: HTMLLabelElement;
  radio: HTMLInputElement;
  status: HTMLSpanElement;
}

/**
 * One card per space (goyan's still shown, then the user's own), plus the custom URL card, which can also add its
 * address to the list. Each card has a live reachability status.
 */
export function createInstancePicker(initial: LauncherSpaces, onError: (message: string) => void): InstancePicker {
  const custom = setupCustomCard();
  const restore = byId("restore-spaces", HTMLButtonElement);
  let cards: SpaceCard[] = [];

  const render = (spaces: LauncherSpaces): void => {
    const previous = custom.radio.checked ? undefined : cards.find(({ radio }) => radio.checked)?.choice;
    cards = [
      ...spaces.instances.map((instance) =>
        renderCard({
          ref: { kind: "instance", id: instance.id },
          choice: { kind: "instance", id: instance.id },
          label: instance.label,
          host: instance.host,
        }),
      ),
      ...spaces.saved.map((space) =>
        renderCard({
          ref: { kind: "saved", id: space.id },
          choice: { kind: "custom", url: space.url },
          label: space.label,
          host: new URL(space.url).host,
        }),
      ),
    ];
    for (const card of cards) {
      query(card.card, ".remove", HTMLButtonElement).addEventListener("click", (event) => {
        // The button sits in the card's label: it must not select the card it removes.
        event.preventDefault();
        void api.removeSpace(card.ref).then(render);
      });
    }
    byId("instances", HTMLDivElement).replaceChildren(...cards.map(({ card }) => card));
    restore.hidden = !spaces.canRestore;
    probeAll();
    if (custom.radio.checked) return;
    const kept = previous && cards.find((card) => sameChoice(card.choice, previous));
    // The chosen space was just removed (or nothing was chosen yet): the first one left, or the custom address.
    const next = kept ?? cards[0];
    if (next) next.radio.checked = true;
    else custom.radio.checked = true;
  };

  const probeAll = (): void => {
    for (const { choice, status } of cards) void probeInto(status, choice);
  };

  const picker: InstancePicker = {
    selectedChoice: () => {
      if (custom.radio.checked) return { kind: "custom", url: custom.input.value };
      return cards.find(({ radio }) => radio.checked)?.choice ?? { kind: "custom", url: custom.input.value };
    },
    select: (choice) => {
      const match = cards.find((card) => sameChoice(card.choice, choice));
      if (match) {
        match.radio.checked = true;
        return;
      }
      if (choice.kind === "custom") {
        custom.radio.checked = true;
        custom.input.value = choice.url;
        probeCustomUrl(choice.url, custom.status);
      }
      // A space of goyan chosen last time and removed since: the first card stays selected.
    },
  };

  restore.addEventListener("click", () => void api.restoreSpaces().then(render));
  custom.add.addEventListener("click", () => void addCustomSpace());
  render(initial);
  setInterval(probeAll, REFRESH_INTERVAL_MS);
  return picker;

  async function addCustomSpace(): Promise<void> {
    const result = await api.addSpace({ label: custom.label.value, url: custom.input.value });
    if (!result.ok) return onError(result.message);
    const url = custom.input.value;
    custom.input.value = "";
    custom.label.value = "";
    showStatus(custom.status, "idle", "");
    custom.radio.checked = false;
    render(result.spaces);
    picker.select({ kind: "custom", url });
  }
}

function sameChoice(a: Choice, b: Choice): boolean {
  if (a.kind === "instance" && b.kind === "instance") return a.id === b.id;
  if (a.kind === "custom" && b.kind === "custom") return sameUrl(a.url, b.url);
  return false;
}

function sameUrl(a: string, b: string): boolean {
  return URL.parse(a.trim())?.href === URL.parse(b.trim())?.href;
}

function renderCard({ ref, choice, label, host }: { ref: SpaceRef; choice: Choice; label: string; host: string }): SpaceCard {
  const template = byId("instance-template", HTMLTemplateElement);
  const card = query(template.content, ".card", HTMLLabelElement).cloneNode(true);
  if (!(card instanceof HTMLLabelElement)) throw new Error("Instance template must contain a .card label");

  const radio = query(card, "input[type=radio]", HTMLInputElement);
  radio.value = ref.kind === "instance" ? ref.id : `saved-${ref.id}`;
  query(card, ".card-title", HTMLSpanElement).textContent = label;
  query(card, ".card-host", HTMLSpanElement).textContent = host;
  query(card, ".remove", HTMLButtonElement).setAttribute("aria-label", `Supprimer l'espace ${label}`);
  return { ref, choice, card, radio, status: query(card, ".status", HTMLSpanElement) };
}

/** Typing in the URL field selects the card and probes once the user pauses. */
function setupCustomCard(): {
  input: HTMLInputElement;
  label: HTMLInputElement;
  add: HTMLButtonElement;
  radio: HTMLInputElement;
  status: HTMLSpanElement;
} {
  const card = query(document, ".card.custom", HTMLLabelElement);
  const input = byId("custom-url", HTMLInputElement);
  const label = byId("custom-label", HTMLInputElement);
  const add = byId("add-space", HTMLButtonElement);
  const radio = query(card, "input[type=radio]", HTMLInputElement);
  const status = query(card, ".status", HTMLSpanElement);

  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  for (const field of [input, label]) field.addEventListener("focus", () => (radio.checked = true));
  // The button sits in the card's label: a click must not move the focus back to the radio.
  add.addEventListener("mousedown", (event) => event.preventDefault());
  input.addEventListener("input", () => {
    clearTimeout(probeTimer);
    probeTimer = setTimeout(() => probeCustomUrl(input.value, status), CUSTOM_PROBE_DELAY_MS);
  });
  return { input, label, add, radio, status };
}

function probeCustomUrl(url: string, status: HTMLSpanElement): void {
  if (!url.trim()) return showStatus(status, "idle", "");
  if (!isHttpUrl(url)) return showStatus(status, "offline", "URL invalide");
  void probeInto(status, { kind: "custom", url });
}

async function probeInto(status: HTMLSpanElement, choice: Choice): Promise<void> {
  showStatus(status, "pending", "Vérification…");
  const result = await api.probe(choice).catch((): ProbeResult => ({ online: false }));
  showStatus(status, result.online ? "online" : "offline", describe(result));
}

function showStatus(status: HTMLSpanElement, state: StatusState, text: string): void {
  status.dataset["state"] = state;
  query(status, ".status-text", HTMLSpanElement).textContent = text;
}

function describe(result: ProbeResult): string {
  if (!result.online) return "hors ligne";
  return result.latencyMs === undefined ? "en ligne" : `${result.latencyMs} ms`;
}

function isHttpUrl(value: string): boolean {
  const url = URL.parse(value.trim());
  return url !== null && (url.protocol === "https:" || url.protocol === "http:");
}
