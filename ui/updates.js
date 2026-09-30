import { $, api, action } from "./shared.js";
export async function initUpdates() {
  function render(state) {
    $("#launcher-update-status").textContent = state.message;
    $("#launcher-update-status").dataset.phase = state.phase;
    $("#launcher-current-version").textContent = `当前版本 v${state.current}`;
    $("#launcher-update-notes").textContent = state.notes || "";
    $("#launcher-update-notes").hidden =
      !state.notes || state.phase !== "available";
    $("#install-launcher-update").hidden = state.phase !== "available";
    $("#restart-launcher-update").hidden = state.phase !== "ready";
    $("#cancel-launcher-update").hidden = state.phase !== "downloading";
    $("#check-launcher-update").disabled = [
      "checking",
      "downloading",
      "extracting",
      "ready",
    ].includes(state.phase);
    const progress = $("#launcher-update-progress");
    progress.hidden = state.phase !== "downloading";
    if (state.total) {
      progress.max = state.total;
      progress.value = state.received || 0;
    }
    $("#update-indicator").hidden = !["available", "ready"].includes(
      state.phase,
    );
  }
  api.onLauncherUpdate(render);
  render(await api.updateState());
  for (const [id, run] of [
    ["check-launcher-update", api.checkLauncherUpdate],
    ["install-launcher-update", api.installLauncherUpdate],
    ["cancel-launcher-update", api.cancelLauncherUpdate],
    ["restart-launcher-update", api.restartUpdatedLauncher],
    ["open-launcher-repo", api.openRepository],
  ])
    $("#" + id).onclick = (event) => action(event.currentTarget, run);
}
