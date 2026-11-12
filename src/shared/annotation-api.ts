import { z } from "zod";

/**
 * Screen annotations while the user shares their screen: a transparent window over that screen, which the share
 * captures (so the others see the drawings), driven from the meeting bar (which the share does not capture).
 * "mouse" gives the mouse back to the apps underneath and keeps the drawings.
 */
export const ANNOTATION_TOOLS = ["pen", "laser", "mouse"] as const;
export type AnnotationTool = (typeof ANNOTATION_TOOLS)[number];

export const annotationCommandSchema = z.union([
  z.object({ tool: z.enum(ANNOTATION_TOOLS) }),
  z.object({ action: z.enum(["clear", "stop"]) }),
]);
export type AnnotationCommand = z.infer<typeof annotationCommandSchema>;

export const ANNOTATION_CHANNELS = {
  /** Main → overlay page: the tool to draw with, or clear. */
  command: "annotation:command",
  /** Overlay page → main: Escape, back to the mouse (drawings kept). */
  release: "annotation:release",
} as const;
export type AnnotationChannel = (typeof ANNOTATION_CHANNELS)[keyof typeof ANNOTATION_CHANNELS];

/** Exposed to the overlay page by src/preload/annotation.cts. */
export interface AnnotationApi {
  onCommand(listener: (command: AnnotationCommand) => void): void;
  /** Escape: back to the mouse. */
  release(): void;
}
