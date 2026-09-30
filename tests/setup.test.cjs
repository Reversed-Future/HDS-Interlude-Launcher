const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const tar = require("tar");
const {
  inspectPackage,
  installedVersion,
  comparison,
  NAME,
} = require("../src/setup/packages.cjs");
const { SetupService, BASE_PACKAGES } = require("../src/setup/service.cjs");
const { ConfigStore, defaults } = require("../src/config.cjs");
const { writeConfiguration } = require("../src/setup/configuration.cjs");
const { validateEntry } = require("../src/setup/archives.cjs");
const { parseReleases } = require("../src/setup/releases.cjs");
const { runNpm } = require("../src/setup/runner.cjs");
const { execFileSync } = require("node:child_process");
const { extractSnow } = require("../src/setup/archives.cjs");
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "hds-setup-"));
console.log("安装测试材料保留于", folder);
async function tgz(label, pkg) {
  const directory = path.join(folder, label);
  fs.mkdirSync(path.join(directory, "package"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "package/package.json"),
    JSON.stringify(pkg),
  );
  const file = path.join(directory, "plugin.tgz");
  await tar.c({ gzip: true, file, cwd: directory }, ["package"]);
  return file;
}
function project(label) {
  const dir = path.join(folder, label);
  fs.mkdirSync(dir);
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "fixture",
      version: "1.0.0",
      scripts: { start: "node index.js" },
    }),
  );
  fs.writeFileSync(path.join(dir, "koishi.yml"), "original: true\n");
  const store = new ConfigStore(path.join(dir, "launcher-settings.json"));
  store.save({ ...defaults, koishiDir: dir });
  const processes = {
    busy: new Set(),
    children: new Map(),
    batchStarting: false,
  };
  return { dir, store, processes };
}
test("tgz metadata uses the exact package name and version; rejects other packages", async () => {
  const file = await tgz("valid", { name: NAME, version: "1.0.1-rc28" });
  const metadata = await inspectPackage(file);
  assert.equal(metadata.version, "1.0.1-rc28");
  assert.equal(metadata.sha256.length, 64);
  await assert.rejects(
    inspectPackage(
      await tgz("wrong", { name: NAME + "-cev", version: "1.0.0" }),
    ),
    /包名必须/,
  );
  assert.equal(comparison("1.0.1-rc28", "1.0.1-rc24"), "所选版本较旧");
  assert.equal(comparison("1.0.1-rc28", "1.0.1-rc29"), "有新版本");
  assert.equal(comparison("1.0.1-rc28", "1.0.1-rc28"), "版本一致");
});
test("beta checks pin the reviewed version, back up config and verify the installed version", async () => {
  const { dir, store, processes } = project("beta");
  const calls = [];
  const service = new SetupService(store, processes, {
    npm: async (args, cwd) => {
      calls.push({ args, cwd });
      if (args[0] === "view")
        return JSON.stringify({ beta: "1.0.1-rc28", latest: "0.1.4" });
      fs.mkdirSync(path.join(dir, "node_modules", NAME), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "node_modules", NAME, "package.json"),
        JSON.stringify({ name: NAME, version: "1.0.1-rc28" }),
      );
    },
  });
  const plan = await service.checkBeta();
  const result = await service.install(plan.id);
  assert.deepEqual(
    calls.slice(1, 4).map((call) => call.args),
    [
      ["install", ...BASE_PACKAGES],
      ["install", "koishi-plugin-adapter-onebot"],
      ["install", "@koishijs/plugin-database-sqlite"],
    ],
  );
  assert.ok(calls.every((call) => call.cwd === dir));
  assert.deepEqual(calls[4], {
    args: ["install", "--save-exact", NAME + "@1.0.1-rc28"],
    cwd: dir,
  });
  assert.equal(
    fs.readFileSync(path.join(result.backup, "koishi.yml"), "utf8"),
    "original: true\n",
  );
  assert.equal(installedVersion(dir), plan.version);
});
test("a prerequisite failure stops HDSI installation and leaves a backup", async () => {
  const { dir, store, processes } = project("prerequisite-failure");
  const calls = [];
  const service = new SetupService(store, processes, {
    npm: async (args) => {
      calls.push(args);
      if (args.includes("koishi-plugin-adapter-onebot"))
        throw new Error("fixture prerequisite failed");
    },
  });
  const plan = await service.inspect(
    await tgz("prerequisite-failure-pkg", {
      name: NAME,
      version: "1.0.1-rc28",
    }),
  );
  await assert.rejects(service.install(plan.id), /fixture prerequisite failed/);
  assert.equal(calls.length, 2);
  assert.equal(
    calls.some((args) => args.includes("--save-exact")),
    false,
  );
  assert.equal(
    fs.readdirSync(path.join(dir, ".hds-launcher-backups")).length,
    1,
  );
  assert.equal(service.busy, false);
});
test("changed tgz and running Koishi block installation before npm", async () => {
  const { store, processes } = project("blocked");
  let calls = 0;
  const service = new SetupService(store, processes, {
    npm: async () => {
      calls++;
    },
  });
  const file = await tgz("tamper", { name: NAME, version: "1.0.0" });
  const plan = await service.inspect(file);
  processes.children.set("koishi", {});
  await assert.rejects(service.install(plan.id), /先在启动台停止/);
  processes.children.clear();
  await tgz("tamper", { name: NAME, version: "1.0.1" });
  await assert.rejects(service.install(plan.id), /安装包已变化/);
  assert.equal(calls, 0);
  assert.equal(service.busy, false);
});
test("full YAML is validated and backed up before replacement", () => {
  const { dir } = project("yaml");
  assert.throws(() => writeConfiguration(dir, "plugins: ["), /YAML/);
  assert.equal(
    fs.readFileSync(path.join(dir, "koishi.yml"), "utf8"),
    "original: true\n",
  );
  const yaml = "plugins:\n  group:hdsi:\n    hds-interlude:\n      model: {}\n";
  const result = writeConfiguration(dir, yaml);
  assert.equal(fs.readFileSync(result.target, "utf8"), yaml);
  assert.equal(result.bak, path.join(dir, "koishi.yml.bak"));
  assert.equal(fs.readFileSync(result.bak, "utf8"), "original: true\n");
  assert.equal(
    fs.readFileSync(path.join(result.backup, "koishi.yml"), "utf8"),
    "original: true\n",
  );
  const updated = yaml + "# second save\n";
  const second = writeConfiguration(dir, updated);
  assert.equal(fs.readFileSync(second.target, "utf8"), updated);
  assert.equal(fs.readFileSync(second.bak, "utf8"), yaml);
  assert.equal(
    fs.readFileSync(path.join(second.backup, "koishi.yml.bak"), "utf8"),
    "original: true\n",
  );
});
test("backup failure leaves the original Koishi configuration intact", () => {
  const { dir } = project("backup-blocked");
  fs.mkdirSync(path.join(dir, "koishi.yml.bak"));
  assert.throws(() =>
    writeConfiguration(dir, "plugins:\n  group:hdsi:\n    hds-interlude: {}\n"),
  );
  assert.equal(
    fs.readFileSync(path.join(dir, "koishi.yml"), "utf8"),
    "original: true\n",
  );
});
test("new configuration creates the enabled sticker directory and preserves existing sticker files", () => {
  const dir = path.join(folder, "fresh-config");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
  const text =
    "plugins:\n  group:hdsi:\n    hds-interlude:\n      stickers:\n        enabled: true\n";
  const result = writeConfiguration(dir, text);
  assert.equal(result.bak, null);
  assert.equal(
    result.stickers,
    path.join(dir, "data", "hds-interlude", "stickers"),
  );
  assert.equal(fs.statSync(result.stickers).isDirectory(), true);
  fs.writeFileSync(path.join(result.stickers, "preserved.txt"), "keep");
  writeConfiguration(dir, text);
  assert.equal(
    fs.readFileSync(path.join(result.stickers, "preserved.txt"), "utf8"),
    "keep",
  );
  const {
    stickerDirectory,
    createStickerDirectory,
  } = require("../src/setup/stickers.cjs");
  assert.throws(() => createStickerDirectory(""), /完整目录/);
  assert.equal(stickerDirectory(dir).exists, true);
  assert.equal(createStickerDirectory(dir).directory, result.stickers);
});
test("ZIP extraction rejects traversal, alternate streams and links", () => {
  for (const fileName of [
    "../escape",
    "C:/escape",
    "file:stream",
    "folder./escape",
    "folder\\file",
  ])
    assert.throws(() =>
      validateEntry(folder, { fileName, externalFileAttributes: 0 }),
    );
  assert.throws(
    () =>
      validateEntry(folder, {
        fileName: "link",
        externalFileAttributes: 0xa000 << 16,
      }),
    /符号链接/,
  );
  assert.equal(
    validateEntry(folder, {
      fileName: "app/launcher.bat",
      externalFileAttributes: 0,
    }),
    path.join(folder, "app/launcher.bat"),
  );
});
test("SnowLuma ZIP extracts to a new directory and records its exact launcher path", async () => {
  const source = path.join(folder, "zip-source");
  fs.mkdirSync(path.join(source, "SnowLuma"), { recursive: true });
  fs.writeFileSync(path.join(source, "SnowLuma/launcher.bat"), "@echo fixture");
  const archive = path.join(folder, "snow.zip");
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:HDS_TEST_ZIP_SOURCE, $env:HDS_TEST_ZIP_TARGET)",
    ],
    {
      windowsHide: true,
      env: {
        ...process.env,
        HDS_TEST_ZIP_SOURCE: source,
        HDS_TEST_ZIP_TARGET: archive,
      },
    },
  );
  const target = path.join(folder, "snow-extracted");
  assert.equal(
    await extractSnow(archive, target, () => {}),
    path.join(target, "SnowLuma"),
  );
  assert.equal(
    fs.readFileSync(path.join(target, "SnowLuma/launcher.bat"), "utf8"),
    "@echo fixture",
  );
  await assert.rejects(
    extractSnow(archive, target, () => {}),
    /已有目录不会被覆盖/,
  );
});
test("Gitee release parser reads actual attachment URLs without inferring a latest version", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "./fixtures/gitee-releases.html"),
    "utf8",
  );
  const rows = parseReleases(html);
  assert.ok(
    rows.some(
      (row) => row.name === "koishi-plugin-hds-interlude-1.0.1-rc24.tgz",
    ),
  );
  assert.ok(
    rows.every((row) =>
      row.url.startsWith(
        "https://gitee.com/MomoiCore/hds-interlude/releases/download/",
      ),
    ),
  );
  assert.throws(() => parseReleases("<html></html>"), /没有返回/);
});
test(
  "real npm installs a local fixture tgz in a path with spaces and shell characters",
  { timeout: 60000 },
  async () => {
    const { dir, store, processes } = project("中文 空格 & npm");
    const file = await tgz("包 & 空格", { name: NAME, version: "1.0.1-rc28" });
    const service = new SetupService(store, processes, {
      npm: (args, cwd, log) =>
        args.includes("--save-exact")
          ? runNpm(
              [
                ...args,
                "--offline",
                "--ignore-scripts",
                "--no-audit",
                "--no-fund",
              ],
              cwd,
              log,
            )
          : Promise.resolve("fixture prerequisite success"),
    });
    const plan = await service.inspect(file);
    const result = await service.install(plan.id);
    assert.equal(result.installed, "1.0.1-rc28");
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
    );
    assert.ok(pkg.dependencies[NAME].startsWith("file:"));
  },
);
