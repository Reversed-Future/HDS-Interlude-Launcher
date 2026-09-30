const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const { version } = require("../package.json");
const build = JSON.parse(
  fs.readFileSync(path.join(root, "release/latest.json"), "utf8"),
);
const output = path.join(root, "release", `assets-${version}-${Date.now()}`);
fs.mkdirSync(output);
const asset = `HDS-Interlude-Launcher-${version}-win-x64.zip`;
const file = path.join(output, asset);
const env = {
  ...process.env,
  HDS_RELEASE_SOURCE: build.directory,
  HDS_RELEASE_ZIP: file,
};
delete env.PSModulePath;
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:HDS_RELEASE_SOURCE, $env:HDS_RELEASE_ZIP, [IO.Compression.CompressionLevel]::Optimal, $false)",
  ],
  { env, windowsHide: true, timeout: 300000 },
);
const sha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync(file))
  .digest("hex");
const manifest = {
  schemaVersion: 1,
  version,
  platform: "win32",
  arch: "x64",
  asset,
  size: fs.statSync(file).size,
  sha256,
};
fs.writeFileSync(
  path.join(output, "launcher-update.json"),
  JSON.stringify(manifest, null, 2),
);
fs.writeFileSync(path.join(output, "SHA256SUMS.txt"), `${sha256}  ${asset}\n`);
fs.writeFileSync(
  path.join(root, "release/assets.json"),
  JSON.stringify(
    {
      directory: output,
      files: [
        file,
        path.join(output, "launcher-update.json"),
        path.join(output, "SHA256SUMS.txt"),
      ],
    },
    null,
    2,
  ),
);
console.log(output);
