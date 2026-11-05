import { z } from "zod";

/**
 * The look chosen in WorkAdventure's settings (fork, Stores/RetroThemeStore.ts), reported by the page through
 * `window.WAD.reportAppearance`: the local pages (launcher, toolbar, About) follow it, and it is remembered for the
 * next launch. Values unknown to this version fall back to the defaults.
 */
export const PALETTES = ["night", "forest", "ember", "gameboy", "light"] as const;
export const FONTS = ["pixel", "system", "classic", "arcade"] as const;

export const appearanceSchema = z.object({ palette: z.enum(PALETTES), font: z.enum(FONTS) });
export type Appearance = z.infer<typeof appearanceSchema>;

export const DEFAULT_APPEARANCE: Appearance = { palette: "night", font: "pixel" };

export const APPEARANCE_CHANNELS = {
  get: "appearance:get",
  changed: "appearance:changed",
} as const;
export type AppearanceChannel = (typeof APPEARANCE_CHANNELS)[keyof typeof APPEARANCE_CHANNELS];

/** Shared by the launcher, toolbar and About bridges. */
export interface AppearanceApi {
  get(): Promise<Appearance>;
  onChange(listener: (appearance: Appearance) => void): void;
}
