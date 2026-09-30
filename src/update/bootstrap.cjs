const fs = require("node:fs");
const path = require("node:path");
const semver = require("semver");
const { verifyInstalled } = require("./files.cjs");
function readUpdateTarget(profile, current) {
  try {
    const record = JSON.parse(
      fs.readFileSync(path.join(profile, "active-version.json"), "utf8"),
    );
    if (!semver.valid(record.version) || !semver.gt(record.version, current))
      return null;
    const directory = path.resolve(record.directory);
    if (!directory.startsWith(path.resolve(profile, "versions") + path.sep))
      return null;
    return verifyInstalled(directory, record.version);
  } catch {
    return null;
  }
}
function activateVersion(profile, staged) {
  if (
    !semver.valid(staged.version) ||
    !path
      .resolve(staged.directory)
      .startsWith(path.resolve(profile, "versions") + path.sep)
  )
    throw new Error("无效的更新目录或版本。");
  const executable = verifyInstalled(staged.directory, staged.version);
  const target = path.join(profile, "active-version.json");
  fs.writeFileSync(target + ".tmp", JSON.stringify(staged, null, 2));
  fs.renameSync(target + ".tmp", target);
  return executable;
}
module.exports = { readUpdateTarget, activateVersion };
