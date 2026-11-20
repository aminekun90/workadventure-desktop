import type { Appearance } from "../../shared/appearance-api.js";
import type { ToolbarApi } from "../../shared/toolbar-api.js";
import type { EnvironmentRequest, EnvironmentState, GraphicsQuality } from "../../shared/environment-api.js";
import { byId } from "../dom.js";

const QUALITY_LABELS: Readonly<Record<GraphicsQuality, string>> = { low: "Bas", medium: "Moyen", high: "Haut", ultra: "Ultra", custom: "Personnalisé" };

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

  const controls = Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting], [data-appearance]"));
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
  for (const control of controls) {
    control.addEventListener("change", () => {
      const setting = control.dataset["setting"] as keyof EnvironmentState;
      const appearanceKey = control.dataset["appearance"] as keyof Appearance | undefined;
      const value = control instanceof HTMLInputElement ? control.type === "checkbox" ? control.checked : control.value : control.value;
      // The bundled form uses wire values; main validates the discriminated request before sending it to WA.
      if (appearanceKey && !appearance) return;
      const request = (appearanceKey ? { setting: "appearance", value: { ...appearance, [appearanceKey]: value } } : { setting, value }) as EnvironmentRequest;
      status.textContent = "";
      void (appearanceKey && appearance ? api.appearance.set({ ...appearance, [appearanceKey]: value } as Appearance) : api.setEnvironment(request)).catch(showError);
    });
  }
  let environment: EnvironmentState | null = null;
  // Every other setting lives in WorkAdventure: this button opens them there, when the page knows how.
  const openWa = byId("settings-open-wa", HTMLButtonElement);
  openWa.addEventListener("click", () => {
    status.textContent = "";
    void api.setEnvironment({ setting: "openSettings", value: true } as EnvironmentRequest).then(() => toggle(false)).catch(showError);
  });
  const render = (): void => {
    const state = environment;
    status.textContent = state?.error || (!state ? "Rejoins une carte pour activer les options grisées." : state.busy ? "Application du réglage…" : "");
    for (const control of controls) {
      const setting = control.dataset["setting"] as keyof EnvironmentState;
      const appearanceKey = control.dataset["appearance"] as keyof Appearance | undefined;
      const value = appearanceKey ? appearance?.[appearanceKey] : setting === "weather" ? state?.mapWeather ?? state?.weather : state?.[setting];
      const row = control.closest<HTMLElement>(".choice-group, .setting-row");
      const sharedWeather = setting === "weather" || setting === "weatherAuto";
      const unsupportedWeather = setting === "weather" && state?.mapWeather === undefined && ["real", "cloudy", "fog"].includes(control.value);
      const unavailable = unsupportedWeather || value === undefined || (!appearanceKey && (!!state?.busy || (sharedWeather && !state?.canEditWeather)));
      control.disabled = unavailable;
      if (row) row.title = unavailable ? !state && !appearanceKey ? "Disponible une fois dans une carte" : sharedWeather && !state?.canEditWeather ? "Modification réservée aux éditeurs de la carte" : "Option indisponible dans cette version de la carte" : "";
      if (value === undefined) continue;
      if (control instanceof HTMLInputElement && control.type === "radio") control.checked = value === control.value;
      else if (document.activeElement !== control) {
        if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = value === true;
        else control.value = String(value);
      }
    }
    byId("graphics-quality-current", HTMLParagraphElement).textContent = state?.graphicsQuality === undefined ? "Disponible avec une carte compatible." : `Préréglage actuel : ${QUALITY_LABELS[state.graphicsQuality]}`;
    openWa.hidden = state?.canOpenSettings !== true;
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
/** Groups of rows: one with nothing left to show hides while searching. */
const GROUPS = ".sound-group, .light-group, .settings-section";

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
        const text = searchText(`${item.textContent ?? ""} ${item.dataset["search"] ?? ""} ${item.closest(".sound-group, .light-group")?.querySelector("h3, summary")?.textContent ?? ""} ${item.closest(".settings-section")?.querySelector("h2")?.textContent ?? ""}`);
        const match = !searching || words.every((word) => text.includes(word));
        item.classList.toggle("search-miss", !match);
        if (match && !item.hidden) shown++;
      }
      for (const group of Array.from(section.querySelectorAll<HTMLElement>(GROUPS))) {
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
