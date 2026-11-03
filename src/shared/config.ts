import { z } from "zod";

export const instanceIdSchema = z.enum(["prod", "beta"], {
  error: (issue) => `Unknown instance: ${String(issue.input)}. Allowed: prod, beta (add new ones to src/shared/config.ts)`,
});
export type InstanceId = z.infer<typeof instanceIdSchema>;

export interface Instance {
  label: string;
  url: string;
}

export const INSTANCES: Record<InstanceId, Instance> = {
  prod: { label: "Production", url: "https://wa.goyan.fr/" },
  beta: { label: "Beta", url: "https://wa-beta.goyan.fr/" },
};

export const customUrlSchema = z
  .string()
  .trim()
  .pipe(z.url({ protocol: /^https?$/, error: "URL invalide : attendu http(s)://hôte[:port]/…" }));

export const choiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("instance"), id: instanceIdSchema }),
  z.object({ kind: z.literal("custom"), url: customUrlSchema }),
]);
export type Choice = z.infer<typeof choiceSchema>;

export const settingsSchema = z.object({ choice: choiceSchema, skipLauncher: z.boolean() });
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = { choice: { kind: "instance", id: "prod" }, skipLauncher: false };

export interface StartupSwitches {
  url?: string | undefined;
  instance?: string | undefined;
  launcher: boolean;
}

export type Startup = { mode: "launcher" } | { mode: "direct"; choice: Choice };

/** CLI switches win over saved settings; invalid switches throw so `run.sh` fails fast. */
export function resolveStartup(switches: StartupSwitches, settings: Settings): Startup {
  if (switches.launcher) return { mode: "launcher" };
  if (switches.url) return { mode: "direct", choice: { kind: "custom", url: customUrlSchema.parse(switches.url) } };
  if (switches.instance) {
    return { mode: "direct", choice: { kind: "instance", id: instanceIdSchema.parse(switches.instance) } };
  }
  return settings.skipLauncher ? { mode: "direct", choice: settings.choice } : { mode: "launcher" };
}

export function choiceUrl(choice: Choice): string {
  return choice.kind === "instance" ? INSTANCES[choice.id].url : choice.url;
}

/** A custom URL on a known instance (e.g. a room link) is labelled as that instance. */
export function choiceLabel(choice: Choice): string {
  if (choice.kind === "instance") return INSTANCES[choice.id].label;
  const { origin } = new URL(choice.url);
  return Object.values(INSTANCES).find((instance) => new URL(instance.url).origin === origin)?.label ?? "Personnalisé";
}
