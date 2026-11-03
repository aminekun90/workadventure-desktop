import { app, dialog, type BrowserWindow } from "electron";
import type { UpdateStatus } from "../shared/update-api.js";

/**
 * Answers a check started from the menu: the launcher shows the status, but from the WorkAdventure
 * window a manual check would otherwise look like it did nothing.
 */
export async function reportManualCheck(
  status: UpdateStatus,
  { parent, onApply }: { parent: BrowserWindow | undefined; onApply: () => Promise<void> },
): Promise<void> {
  const show = (options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> =>
    parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);

  switch (status.state) {
    case "checking":
      return;
    case "disabled":
      await show({ type: "info", message: "Mises à jour désactivées", detail: "L'app tourne depuis les sources : elle se met à jour avec git." });
      return;
    case "up-to-date":
      await show({ type: "info", message: "WorkAdventure est à jour", detail: `Version ${app.getVersion()}` });
      return;
    case "failed":
      await show({ type: "warning", message: "Impossible de vérifier les mises à jour", detail: "Vérifie ta connexion, puis réessaie." });
      return;
    case "downloading":
      await show({
        type: "info",
        message: `La version ${status.version} est disponible`,
        detail: "Elle se télécharge en arrière-plan : un bouton « Redémarrer » apparaîtra dans la barre du haut.",
      });
      return;
    case "ready": {
      const restart = status.action === "restart";
      const { response } = await show({
        type: "question",
        message: `La version ${status.version} est prête`,
        detail: restart ? "Redémarrer maintenant pour l'installer ?" : "Télécharger la nouvelle version ?",
        buttons: [restart ? "Redémarrer maintenant" : "Télécharger", "Plus tard"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) await onApply();
    }
  }
}
