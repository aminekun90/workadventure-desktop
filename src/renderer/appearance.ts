import type { Appearance, AppearanceApi } from "../shared/appearance-api.js";

/** Applies the look chosen in WorkAdventure to this page (theme.css reads `data-palette` and `data-font`). */
export function mountAppearance(api: AppearanceApi): void {
  void api.get().then(apply);
  api.onChange(apply);
}

function apply(appearance: Appearance): void {
  document.documentElement.dataset["palette"] = appearance.palette;
  document.documentElement.dataset["font"] = appearance.font;
}
