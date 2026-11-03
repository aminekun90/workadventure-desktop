import type { UpdateApi, UpdateStatus } from "../shared/update-api.js";
import { byId } from "./dom.js";

/**
 * Renders the update status: #update is the action button, shown once an update is ready;
 * #update-status (launcher only) narrates the check run at launch.
 */
export function mountUpdateStatus(api: UpdateApi): void {
  const button = byId("update", HTMLButtonElement);
  const label = document.getElementById("update-status");

  const render = (status: UpdateStatus): void => {
    button.hidden = status.state !== "ready";
    if (status.state === "ready") {
      button.textContent = status.action === "restart" ? `Redémarrer pour la v${status.version}` : `Télécharger la v${status.version}`;
    }
    if (label) label.textContent = describe(status);
  };

  button.addEventListener("click", () => void api.apply());
  api.onChange(render);
  void api.get().then(render);
}

function describe(status: UpdateStatus): string {
  switch (status.state) {
    case "checking":
      return "Recherche de mises à jour…";
    case "up-to-date":
      return "À jour";
    case "failed":
      return "Vérification des mises à jour impossible";
    case "downloading":
      return `Téléchargement de la v${status.version} · ${status.percent} %`;
    case "disabled":
    case "ready":
      return "";
  }
}
