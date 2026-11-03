import { byId, query } from "../dom.js";

/** Shows the user's woka, one sprite sheet per layer stacked bottom to top, in place of the default character. */
export function showAvatar(layers: readonly string[]): void {
  const avatar = byId("avatar", HTMLDivElement);
  avatar.replaceChildren(
    ...layers.map((sheet) => {
      const layer = document.createElement("span");
      layer.style.setProperty("--sheet", `url("${sheet}")`);
      return layer;
    }),
  );
  query(document, ".stage", HTMLDivElement).dataset["avatar"] = "true";
}
