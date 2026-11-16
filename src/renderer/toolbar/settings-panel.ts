import type { Appearance } from "../../shared/appearance-api.js";
import type { ToolbarApi } from "../../shared/toolbar-api.js";
import type { EnvironmentRequest, EnvironmentState, SoundSetting } from "../../shared/environment-api.js";
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
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !panel.hidden) void toggle(false); });
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
    byId("music-source-description", HTMLParagraphElement).textContent = !state ? "La source sera affichée une fois dans une carte." : state.lampMusicSource === "personal" ? "Les lumières suivent le Spotify de cet ordinateur." : "Chaque lampe suit le salon musical de sa zone, même si je suis dans un autre salon.";
  };
  api.appearance.onChange((value) => { appearance = value; render(); });
  void api.appearance.get().then((value) => { appearance = value; render(); }).catch(showError);
  api.onEnvironment((state) => { environment = state; render(); });
  render();
}
