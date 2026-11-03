import type { Choice } from "../../shared/config.js";
import type { LauncherInstance, ProbeResult } from "../../shared/launcher-api.js";
import { api } from "./bridge.js";
import { byId, query } from "../dom.js";

const REFRESH_INTERVAL_MS = 15_000;
const CUSTOM_PROBE_DELAY_MS = 500;

type StatusState = "idle" | "pending" | "online" | "offline";

export interface InstancePicker {
  selectedChoice(): Choice;
  select(choice: Choice): void;
}

interface InstanceCard {
  instance: LauncherInstance;
  card: HTMLLabelElement;
  radio: HTMLInputElement;
  status: HTMLSpanElement;
}

/** One card per instance plus the custom URL card, each with a live reachability status. */
export function createInstancePicker(instances: readonly LauncherInstance[]): InstancePicker {
  const cards = instances.map(renderCard);
  byId("instances", HTMLDivElement).replaceChildren(...cards.map(({ card }) => card));
  watchInstances(cards);

  const custom = setupCustomCard();

  return {
    selectedChoice: () => {
      if (custom.radio.checked) return { kind: "custom", url: custom.input.value };
      const selected = cards.find(({ radio }) => radio.checked);
      if (!selected) throw new Error("No space selected: select() must run at startup");
      return { kind: "instance", id: selected.instance.id };
    },
    select: (choice) => {
      if (choice.kind === "custom") {
        custom.radio.checked = true;
        custom.input.value = choice.url;
        probeCustomUrl(choice.url, custom.status);
        return;
      }
      const selected = cards.find(({ instance }) => instance.id === choice.id);
      if (selected) selected.radio.checked = true;
    },
  };
}

function renderCard(instance: LauncherInstance): InstanceCard {
  const template = byId("instance-template", HTMLTemplateElement);
  const card = query(template.content, ".card", HTMLLabelElement).cloneNode(true);
  if (!(card instanceof HTMLLabelElement)) throw new Error("Instance template must contain a .card label");

  const radio = query(card, "input[type=radio]", HTMLInputElement);
  radio.value = instance.id;
  query(card, ".card-title", HTMLSpanElement).textContent = instance.label;
  query(card, ".card-host", HTMLSpanElement).textContent = instance.host;
  return { instance, card, radio, status: query(card, ".status", HTMLSpanElement) };
}

function watchInstances(cards: readonly InstanceCard[]): void {
  const refresh = (): void => {
    for (const { instance, status } of cards) void probeInto(status, { kind: "instance", id: instance.id });
  };
  refresh();
  setInterval(refresh, REFRESH_INTERVAL_MS);
}

/** Typing in the URL field selects the card and probes once the user pauses. */
function setupCustomCard(): { input: HTMLInputElement; radio: HTMLInputElement; status: HTMLSpanElement } {
  const card = query(document, ".card.custom", HTMLLabelElement);
  const input = byId("custom-url", HTMLInputElement);
  const radio = query(card, "input[type=radio]", HTMLInputElement);
  const status = query(card, ".status", HTMLSpanElement);

  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener("focus", () => (radio.checked = true));
  input.addEventListener("input", () => {
    clearTimeout(probeTimer);
    probeTimer = setTimeout(() => probeCustomUrl(input.value, status), CUSTOM_PROBE_DELAY_MS);
  });
  return { input, radio, status };
}

function probeCustomUrl(url: string, status: HTMLSpanElement): void {
  if (!url.trim()) return showStatus(status, "idle", "—");
  if (!isHttpUrl(url)) return showStatus(status, "offline", "URL invalide");
  void probeInto(status, { kind: "custom", url });
}

async function probeInto(status: HTMLSpanElement, choice: Choice): Promise<void> {
  showStatus(status, "pending", "…");
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
