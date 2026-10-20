const fs = require("node:fs");
const path = require("node:path");
const file = (directory) => path.join(directory, ".hds-launcher-configuration");
function markConfiguration(directory, state) {
  if (!["pending", "saved"].includes(state)) throw new Error("未知配置进度。");
  fs.writeFileSync(file(directory), state, "utf8");
}
function needsConfiguration(directory) {
  try {
    return fs.readFileSync(file(directory), "utf8") === "pending";
  } catch {
    return false;
  }
}
module.exports = { markConfiguration, needsConfiguration };
