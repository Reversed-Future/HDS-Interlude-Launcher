const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const electronExecutable = require("electron");
const destination = path.join(
  root,
  "release",
  `HDS-Interlude-Launcher-${require("../package.json").version}-${Date.now()}`,
);
// A new output directory on every build; never remove or overwrite prior releases.
function copyTree(source, target) {
  // The retained reference import is not part of the native configuration interface.
  if (
    [
      path.join(root, "ui", "guide"),
      path.join(root, "ui", "guide.js"),
    ].includes(source)
  )
    return;
  if (fs.statSync(source).isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source))
      copyTree(path.join(source, name), path.join(target, name));
  } else {
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  }
}
copyTree(path.dirname(electronExecutable), destination);
fs.renameSync(
  path.join(destination, path.basename(electronExecutable)),
  path.join(destination, "HDS-Interlude Launcher.exe"),
);
require("node:child_process").execFileSync(
  process.execPath,
  [
    path.join(__dirname, "stamp-icon.cjs"),
    path.join(destination, "HDS-Interlude Launcher.exe"),
  ],
  { windowsHide: true, stdio: "inherit" },
);
const appRoot = path.join(destination, "resources", "app");
fs.mkdirSync(appRoot, { recursive: true });
for (const file of [
  "src",
  "ui",
  "package.json",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
]) {
  copyTree(path.join(root, file), path.join(appRoot, file));
}
fs.mkdirSync(path.join(appRoot, "assets"));
for (const file of ["icon.svg", "icon.png", "icon.ico"])
  copyTree(path.join(root, "assets", file), path.join(appRoot, "assets", file));
copyTree(
  path.join(root, "docs", "screenshots"),
  path.join(appRoot, "docs", "screenshots"),
);
// A public build never contains the maintainer's local-settings.json.
// Copy the exact runtime dependency tree recorded by npm; dev dependencies stay out.
const lock = require("../package-lock.json");
for (const [relative, entry] of Object.entries(lock.packages)) {
  if (!relative || entry.dev || !relative.startsWith("node_modules/")) continue;
  const target = path.join(appRoot, relative);
  if (!fs.existsSync(target)) copyTree(path.join(root, relative), target);
}
console.log(path.join(destination, "HDS-Interlude Launcher.exe"));
fs.writeFileSync(
  path.join(root, "release", "latest.json"),
  JSON.stringify(
    {
      directory: destination,
      executable: path.join(destination, "HDS-Interlude Launcher.exe"),
    },
    null,
    2,
  ),
);
