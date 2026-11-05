import { z } from "zod";
import { customUrlSchema, instanceIdSchema, type InstanceId } from "./config.js";

/**
 * The spaces of the launcher besides goyan's: added by the user (a name and a URL), removable. goyan's spaces can be
 * removed too, which only hides them: they come back with « Restaurer les espaces goyan ». Kept in spaces.json.
 */
export const MAX_SAVED_SPACES = 20;
const LABEL_MAX = 40;

export const savedSpaceSchema = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(LABEL_MAX),
  url: customUrlSchema,
});
export type SavedSpace = z.infer<typeof savedSpaceSchema>;

export const spacesSchema = z.object({
  saved: z.array(savedSpaceSchema).max(MAX_SAVED_SPACES),
  hiddenInstances: z.array(instanceIdSchema),
});
export type Spaces = z.infer<typeof spacesSchema>;

export const DEFAULT_SPACES: Spaces = { saved: [], hiddenInstances: [] };

/** What the launcher sends to add a space: an empty name takes the host of the URL. */
export const newSpaceSchema = z.object({
  label: z.string().trim().max(LABEL_MAX, `Nom trop long : ${LABEL_MAX} caractères au plus`),
  url: customUrlSchema,
});
export type NewSpace = z.infer<typeof newSpaceSchema>;

export const spaceRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("instance"), id: instanceIdSchema }),
  z.object({ kind: z.literal("saved"), id: z.uuid() }),
]);
export type SpaceRef = z.infer<typeof spaceRefSchema>;

export type AddSpaceResult = { ok: true; spaces: Spaces } | { ok: false; message: string };

/** Adds a space at the end; the same address twice is refused, as is a space beyond the limit. */
export function addSpace(spaces: Spaces, request: NewSpace, id: string): AddSpaceResult {
  const url = new URL(request.url).href;
  if (spaces.saved.some((space) => new URL(space.url).href === url)) {
    return { ok: false, message: "Cet espace est déjà dans la liste." };
  }
  if (spaces.saved.length >= MAX_SAVED_SPACES) {
    return { ok: false, message: `${MAX_SAVED_SPACES} espaces au plus : supprimes-en un d'abord.` };
  }
  const label = request.label || new URL(url).host;
  return { ok: true, spaces: { ...spaces, saved: [...spaces.saved, { id, label, url }] } };
}

/** Removes a saved space, or hides one of goyan's. */
export function removeSpace(spaces: Spaces, ref: SpaceRef): Spaces {
  if (ref.kind === "saved") return { ...spaces, saved: spaces.saved.filter((space) => space.id !== ref.id) };
  if (spaces.hiddenInstances.includes(ref.id)) return spaces;
  return { ...spaces, hiddenInstances: [...spaces.hiddenInstances, ref.id] };
}

export function restoreInstances(spaces: Spaces): Spaces {
  return { ...spaces, hiddenInstances: [] };
}

/** goyan's spaces still shown, in their usual order. */
export function visibleInstances(spaces: Spaces): InstanceId[] {
  return instanceIdSchema.options.filter((id) => !spaces.hiddenInstances.includes(id));
}
