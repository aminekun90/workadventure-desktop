import type { Appearance } from "../../shared/appearance-api.js";
import type { ToolbarApi } from "../../shared/toolbar-api.js";
import type { EnvironmentRequest, EnvironmentState, LightControl, SoundSetting } from "../../shared/environment-api.js";
import { byId } from "../dom.js";

export function mountSettingsPanel(api: Pick<ToolbarApi, "appearance" | "settingsPanel" | "setEnvironment" | "onEnvironment">): void {
  const panel = byId("settings-panel", HTMLElement);
  const openButton = byId("settings", HTMLButtonElement);
  const closeButton = byId("settings-close", HTMLButtonElement);
  let appearance: Appearance | undefined;
  const tabs = Array.from(panel.querySelectorAll<HTMLButtonElement>("[role=tab]"));
  const selectTab = (tab: HTMLButtonElement): void => {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      const content = document.getElementById(item.getAttribute("aria-controls") ?? "");
      if (content) content.hidden = !selected;
    }
  };
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined;
      const next = nextIndex === undefined ? undefined : tabs[nextIndex];
      if (!next) return;
      event.preventDefault();
      selectTab(next);
      next.focus();
    });
  }
  const status = byId("settings-status", HTMLParagraphElement);
  const search = mountSearch(panel, byId("settings-search", HTMLInputElement), byId("settings-search-empty", HTMLParagraphElement));

  const controls = Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting], [data-sound], [data-appearance]"));
  const showError = (error: unknown): void => { status.textContent = `Le réglage n’a pas été appliqué : ${error instanceof Error ? error.message : String(error)}`; };
  const toggle = async (open: boolean): Promise<void> => {
    try {
      await api.settingsPanel(open);
      panel.hidden = !open;
      openButton.setAttribute("aria-expanded", String(open));
      (open ? closeButton : openButton).focus();
    } catch (error) { showError(error); }
  };
  openButton.addEventListener("click", () => void toggle(panel.hidden));
  closeButton.addEventListener("click", () => void toggle(false));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || panel.hidden) return;
    if (search.clear()) return;
    void toggle(false);
  });
  const renderRange = (control: HTMLInputElement): void => {
    const volume = panel.querySelector<HTMLOutputElement>(`[data-volume="${control.dataset["sound"]}"]`);
    if (volume) volume.value = `${Math.round(Number(control.value) * 100)} %`;
    if (control.dataset["setting"] === "cloudsHeight") byId("clouds-height-value", HTMLOutputElement).value = Number(control.value) === 1 ? "Toujours visibles" : Number(control.value) === 0 ? "Basse" : `${Math.round(Number(control.value) * 100)} %`;
  };
  for (const control of controls) {
    if (control instanceof HTMLInputElement && control.type === "range") control.addEventListener("input", () => {
      renderRange(control);
      if (control.dataset["setting"] === "cloudsHeight") void api.setEnvironment({ setting: "cloudsHeight", value: Number(control.value) } as EnvironmentRequest).catch(showError);
    });
    control.addEventListener("change", () => {
      const setting = control.dataset["setting"] as keyof EnvironmentState;
      const appearanceKey = control.dataset["appearance"] as keyof Appearance | undefined;
      const sound = control.dataset["sound"] as SoundSetting | undefined;
      const value = control instanceof HTMLInputElement ? control.type === "checkbox" ? control.checked : control.type === "range" ? Number(control.value) : control.value : control.value;
      // The bundled form uses wire values; main validates the discriminated request before sending it to WA.
      if (appearanceKey && !appearance) return;
      const request = (appearanceKey ? { setting: "appearance", value: { ...appearance, [appearanceKey]: value } } : sound ? { setting: "sounds", value: { sound, volume: Number(value) } } : { setting, value }) as EnvironmentRequest;
      status.textContent = "";
      void (appearanceKey && appearance ? api.appearance.set({ ...appearance, [appearanceKey]: value } as Appearance) : api.setEnvironment(request)).catch(showError);
    });
  }
  let environment: EnvironmentState | null = null;
  const lights = mountLightControls(byId("light-controls", HTMLDivElement), (name, value) => {
    status.textContent = "";
    void api.setEnvironment({ setting: "light", value: { name, value } } as EnvironmentRequest).catch(showError);
  });
  const previews = Array.from(panel.querySelectorAll<HTMLButtonElement>("[data-preview-sound]"));
  for (const button of previews) button.addEventListener("click", () => {
    void api.setEnvironment({ setting: "soundPreview", value: button.dataset["previewSound"] as SoundSetting } as EnvironmentRequest).catch(showError);
  });
  const render = (): void => {
    const state = environment;
    status.textContent = state?.error || (!state ? "Rejoins une carte pour activer les options grisées." : state.busy ? "Application du réglage…" : "");
    for (const control of controls) {
      const setting = control.dataset["setting"] as keyof EnvironmentState;
      const sound = control.dataset["sound"] as SoundSetting | undefined;
      const appearanceKey = control.dataset["appearance"] as keyof Appearance | undefined;
      const value = appearanceKey ? appearance?.[appearanceKey] : sound ? state?.sounds?.[sound] : setting === "weather" ? state?.mapWeather ?? state?.weather : state?.[setting];
      const row = control.closest<HTMLElement>(".choice-group, [data-sound-row], .setting-row");
      // Legacy duplicate options disappear only when the new seasonal control replaces them.
      if (row) row.hidden = (setting === "ground" || setting === "christmas") && (!state || state.seasonal !== undefined);
      const sharedWeather = setting === "weather" || setting === "weatherAuto";
      const unsupportedWeather = setting === "weather" && state?.mapWeather === undefined && ["real", "cloudy", "fog"].includes(control.value);
      const cloudsHidden = setting === "cloudsHeight" && (state?.clouds === false || state?.effects === false);
      const unavailable = cloudsHidden || unsupportedWeather || value === undefined || (!appearanceKey && (!!state?.busy || (sharedWeather && !state?.canEditWeather)));
      control.disabled = unavailable;
      if (row) row.title = unavailable ? !state && !appearanceKey ? "Disponible une fois dans une carte" : sharedWeather && !state?.canEditWeather ? "Modification réservée aux éditeurs de la carte" : "Option indisponible dans cette version de la carte" : "";
      if (value === undefined) continue;
      if (control instanceof HTMLInputElement && control.type === "radio") control.checked = value === control.value;
      else if (document.activeElement !== control) {
        if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = value === true;
        else control.value = String(value);
      }
      if (control instanceof HTMLInputElement && control.type === "range") renderRange(control);
    }
    for (const button of previews) button.disabled = !state || state.busy || state.sounds?.[button.dataset["previewSound"] as SoundSetting] === undefined;
    lights(state);
    search.refresh();
    byId("music-source-description", HTMLParagraphElement).textContent = !state ? "La source sera affichée une fois dans une carte." : state.lampMusicSource === "personal" ? "Les lumières suivent le Spotify de cet ordinateur." : "Chaque lampe suit le salon musical de sa zone, même si je suis dans un autre salon.";
  };
  api.appearance.onChange((value) => { appearance = value; render(); });
  void api.appearance.get().then((value) => { appearance = value; render(); }).catch(showError);
  api.onEnvironment((state) => { environment = state; render(); });
  render();
}

/** Rows of every tab that a search looks through; a light row also matches the explanation in its tooltip. */
const SEARCHABLE = ".setting-row, .choice-group, .sound-row";

/** Normalised for search: lower case, without accents, so « ombre » finds « Ombres » and « eclairage » « Éclairage ». */
export function searchText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * A search at the top of the panel: while it holds text, every tab shows only its matching rows (the tab bar hides),
 * folded groups open, and a section with nothing left disappears. Escape clears it first, then closes the panel.
 */
function mountSearch(panel: HTMLElement, input: HTMLInputElement, empty: HTMLElement): { refresh: () => void; clear: () => boolean } {
  const sections = Array.from(panel.querySelectorAll<HTMLElement>("[role=tabpanel]"));
  const refresh = (): void => {
    const words = searchText(input.value).split(/\s+/).filter(Boolean);
    const searching = words.length > 0;
    panel.classList.toggle("searching", searching);
    let found = 0;
    for (const section of sections) {
      // Every tab while searching; the selected one again once the search is cleared.
      section.hidden = !searching && panel.querySelector(`[aria-controls="${section.id}"]`)?.getAttribute("aria-selected") !== "true";
      const items = Array.from(section.querySelectorAll<HTMLElement>(SEARCHABLE));
      let shown = 0;
      for (const item of items) {
        const text = searchText(`${item.textContent ?? ""} ${item.dataset["search"] ?? ""} ${item.closest(".sound-group, .light-group")?.querySelector("h3, summary")?.textContent ?? ""}`);
        const match = !searching || words.every((word) => text.includes(word));
        item.classList.toggle("search-miss", !match);
        if (match && !item.hidden) shown++;
      }
      for (const group of Array.from(section.querySelectorAll<HTMLElement>(".sound-group, .light-group"))) {
        const visible = Array.from(group.querySelectorAll<HTMLElement>(SEARCHABLE)).some((item) => !item.classList.contains("search-miss") && !item.hidden);
        group.classList.toggle("search-miss", searching && !visible);
        if (group instanceof HTMLDetailsElement && searching && visible) group.open = true;
      }
      section.classList.toggle("search-miss", searching && shown === 0);
      found += shown;
    }
    empty.hidden = !searching || found > 0;
  };
  input.addEventListener("input", refresh);
  return {
    refresh: () => { if (input.value) refresh(); },
    clear: () => {
      if (!input.value) return false;
      input.value = "";
      refresh();
      return true;
    },
  };
}

const LIGHT_GROUPS: Readonly<Record<LightControl["group"], string>> = { night: "Éclairage de nuit", sky: "Soleil et lune", shadows: "Ombres", other: "Performances" };

/**
 * A short label for a row, the rest in its tooltip (still found by the search): WA's labels explain themselves at
 * length, which made the panel heavy. A detail drops the name of the switch it belongs to.
 */
export function splitLightLabel(control: Pick<LightControl, "label" | "kind" | "dependsOn">): { label: string; hint: string } {
  let label = control.label.replace(/^\d+\s*·\s*/, "");
  let hint = "";
  const parenthesis = label.indexOf(" (");
  if (parenthesis > 0) {
    hint = label.slice(parenthesis + 2).replace(/\)/, "").replace(/\s+/g, " ").trim();
    label = label.slice(0, parenthesis).trim();
  }
  const colon = label.indexOf(" : ");
  if (colon > 0 && control.kind !== "number") {
    const [head, tail] = [label.slice(0, colon), label.slice(colon + 3)];
    if (control.dependsOn) label = tail.charAt(0).toUpperCase() + tail.slice(1);
    else { label = head; hint = [tail, hint].filter(Boolean).join(" ; "); }
  }
  const comma = label.indexOf(", ");
  if (comma > 0 && control.kind === "switch" && label.length > 40) {
    hint = [label.slice(comma + 2), hint].filter(Boolean).join(" ; ");
    label = label.slice(0, comma);
  }
  return { label, hint };
}

/**
 * The light settings of WorkAdventure, drawn from the list WA sends (labels, bounds, the switch a detail depends on):
 * rebuilt only when that list changes, so a slider being dragged keeps its place. Texts go in as textContent.
 */
function mountLightControls(container: HTMLElement, send: (name: string, value: number | boolean | string) => void): (state: EnvironmentState | null) => void {
  let signature = "";
  const rows = new Map<string, { row: HTMLElement; label: HTMLElement; input: HTMLInputElement | HTMLSelectElement }>();
  const build = (controls: readonly LightControl[]): void => {
    container.replaceChildren();
    rows.clear();
    for (const [group, title] of Object.entries(LIGHT_GROUPS)) {
      const items = controls.filter((control) => control.group === group);
      if (!items.length) continue;
      const section = document.createElement("details");
      section.className = "light-group";
      const heading = document.createElement("summary");
      const count = document.createElement("small");
      heading.textContent = title;
      count.textContent = `${items.filter((control) => !control.dependsOn).length}`;
      heading.append(count);
      section.append(heading);
      for (const control of items) {
        const row = document.createElement("label");
        row.className = control.dependsOn ? "setting-row setting-detail" : "setting-row";
        const label = document.createElement("span");
        const input = control.kind === "choice" ? document.createElement("select") : document.createElement("input");
        if (input instanceof HTMLSelectElement) {
          for (const choice of control.choices ?? []) {
            const option = document.createElement("option");
            option.value = choice.value;
            option.textContent = choice.label;
            input.append(option);
          }
          input.addEventListener("change", () => send(control.name, input.value));
        } else if (control.kind === "switch") {
          input.type = "checkbox";
          input.setAttribute("role", "switch");
          input.addEventListener("change", () => send(control.name, input.checked));
        } else {
          input.type = "range";
          input.min = String(control.min ?? 0);
          input.max = String(control.max ?? 1);
          input.step = String(control.step ?? 0.05);
          input.addEventListener("change", () => send(control.name, Number(input.value)));
        }
        row.append(label, input);
        section.append(row);
        rows.set(control.name, { row, label, input });
      }
      container.append(section);
    }
  };
  return (state) => {
    const controls = state?.lightControls ?? [];
    const next = controls.map((control) => `${control.name}:${control.kind}`).join("|");
    if (next !== signature) {
      signature = next;
      build(controls);
    }
    const values = new Map(controls.map((control) => [control.name, control.value]));
    for (const control of controls) {
      const entry = rows.get(control.name);
      if (!entry) continue;
      const { label, hint } = splitLightLabel(control);
      entry.label.textContent = label;
      entry.row.title = hint;
      entry.row.dataset["search"] = `${label} ${hint} ${control.choices?.map((choice) => choice.label).join(" ") ?? ""}`;
      entry.row.hidden = control.dependsOn !== undefined && values.get(control.dependsOn) !== true;
      entry.input.disabled = !state || state.busy;
      if (document.activeElement === entry.input) continue;
      if (entry.input instanceof HTMLInputElement && entry.input.type === "checkbox") entry.input.checked = control.value === true;
      else entry.input.value = String(control.value);
    }
  };
}
