const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { snowAsset, resolveQQ } = require("../src/setup/official-sources.cjs");
const { download } = require("../src/setup/download.cjs");
const { validateYaml } = require("../src/setup/configuration.cjs");
const { installNode, WINGET_ARGS } = require("../src/setup/node-installer.cjs");
const { checkInstallation } = require("../src/setup/readiness.cjs");
const { BASE_PACKAGES, SetupService } = require("../src/setup/service.cjs");
const { ConfigStore, defaults } = require("../src/config.cjs");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hds-official-"));
const snow = JSON.parse(
  fs.readFileSync(path.join(__dirname, "./fixtures/snow-latest.json"), "utf8"),
);
const qq = JSON.parse(
  fs.readFileSync(path.join(__dirname, "./fixtures/qq-pcConfig.json"), "utf8"),
);
test("SnowLuma uses the explicit full-package table mapping and official checksum", () => {
  const asset = snowAsset(snow, "x64");
  assert.equal(asset.name, "SnowLuma-v1.14.20-win-x64.zip");
  assert.equal(
    asset.sha256,
    "0ca7bd4a4541cc896ade2a4344ff1901b45eeb4392ab356a71836feb6b311640",
  );
  assert.throws(() => snowAsset(snow, "arm64"), /仅提供 x64/);
  assert.throws(() => snowAsset({ ...snow, body: "changed" }, "x64"), /未列出/);
});
test("QQ selects the exact architecture field then obtains an official fresh signature", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return Response.json(
      calls.length === 1
        ? qq
        : {
            retcode: 0,
            data: { url: qq.Windows.ntDownloadX64Url + "?fixture-sign=1" },
          },
    );
  };
  const asset = await resolveQQ(fetcher, new AbortController().signal, "x64");
  assert.equal(
    JSON.parse(calls[1].options.body).url,
    qq.Windows.ntDownloadX64Url,
  );
  assert.deepEqual(JSON.parse(calls[1].options.headers["x-oidb"]), {
    uint32_command: "0x9b8e",
    uint32_service_type: 1,
  });
  assert.equal(asset.url, qq.Windows.ntDownloadX64Url + "?fixture-sign=1");
  let count = 0;
  await assert.rejects(
    resolveQQ(
      async () =>
        Response.json(
          ++count === 1
            ? qq
            : { retcode: 0, data: { url: "https://example.com/a.exe" } },
        ),
      new AbortController().signal,
    ),
    /官方来源/,
  );
});
function fixtureAsset() {
  const data = Buffer.from("PK fixture binary payload");
  return {
    data,
    asset: {
      name: "fixture.zip",
      url: "https://github.com/fixture.zip",
      hosts: ["github.com", "release-assets.githubusercontent.com"],
      size: data.length,
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
    },
  };
}
test("downloads stream, validate hash and size, and refuse foreign redirects or corrupt files", async () => {
  const { data, asset } = fixtureAsset();
  const signal = new AbortController().signal;
  const progress = [];
  const result = await download(
    async () =>
      new Response(data, {
        headers: { "content-length": String(data.length) },
      }),
    asset,
    directory,
    signal,
    (state) => progress.push(state),
  );
  assert.deepEqual(fs.readFileSync(result.file), data);
  assert.equal(progress.at(-1).received, data.length);
  await assert.rejects(
    download(
      async () => new Response(data),
      { ...asset, sha256: "0".repeat(64) },
      directory,
      signal,
      () => {},
    ),
    /SHA-256/,
  );
  await assert.rejects(
    download(
      async () => new Response(data.subarray(0, 4)),
      asset,
      directory,
      signal,
      () => {},
    ),
    /下载不完整/,
  );
  let calls = 0;
  await assert.rejects(
    download(
      async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { location: "https://example.com/foreign.zip" },
        });
      },
      asset,
      directory,
      signal,
      () => {},
    ),
    /官方来源/,
  );
  assert.equal(calls, 1);
});
test("cancellation closes a partial stream without producing an installable file", async () => {
  const { asset } = fixtureAsset();
  const controller = new AbortController();
  let closed = false;
  await assert.rejects(
    download(
      async () =>
        new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(new Uint8Array([1, 2, 3]));
            },
            cancel() {
              closed = true;
            },
          }),
        ),
      asset,
      directory,
      controller.signal,
      () => controller.abort(),
    ),
    /下载已取消/,
  );
  assert.equal(closed, true);
});
test("configuration writing rejects an embedding connection with mixed purposes", () => {
  assert.throws(
    () =>
      validateYaml(
        "plugins:\n  group:hdsi:\n    hds-interlude:\n      model:\n        providers:\n          - useForEmbedding: true\n            useForMain: true\n",
      ),
    /只能用于向量/,
  );
});
test("Node installation runs the exact package, refreshes PATH before detection, and reports a restart hint on detection failure", async () => {
  const events = [];
  const setup = { job: async (label, action) => action(), log: () => {} };
  const result = await installNode(setup, {
    command: async (args) => {
      assert.deepEqual(args, WINGET_ARGS);
      assert.deepEqual(args.slice(0, 4), [
        "install",
        "-e",
        "--id",
        "OpenJS.NodeJS.LTS",
      ]);
      events.push("install");
    },
    refresh: async () => events.push("refresh"),
    inspect: async () => {
      events.push("inspect");
      return { version: "v22.19.0" };
    },
  });
  assert.equal(result.ready, true);
  assert.deepEqual(events, ["install", "refresh", "inspect"]);
  const retry = await installNode(setup, {
    command: async () => {},
    refresh: async () => {},
    inspect: async () => {
      throw new Error("not visible yet");
    },
  });
  assert.equal(retry.ready, false);
});
test("configuration readiness checks every exact package and program, including subsequent file loss", async () => {
  const dir = path.join(directory, "readiness");
  fs.mkdirSync(dir);
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ scripts: { start: "koishi start" } }),
  );
  for (const name of [
    ...BASE_PACKAGES,
    "koishi",
    "koishi-plugin-adapter-onebot",
    "@koishijs/plugin-database-sqlite",
    "koishi-plugin-hds-interlude",
  ]) {
    const target = path.join(dir, "node_modules", name);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(target, "package.json"),
      JSON.stringify({ name, version: "1.0.0" }),
    );
  }
  for (const file of [
    "QQ.exe",
    "launcher.bat",
    "index.mjs",
    "check-node-version.cjs",
  ])
    fs.writeFileSync(path.join(dir, file), "fixture");
  const config = {
    ...defaults,
    koishiDir: dir,
    snowlumaDir: dir,
    qqExe: path.join(dir, "QQ.exe"),
  };
  assert.equal(
    checkInstallation(config, { version: "v22.19.0" }, BASE_PACKAGES).ready,
    true,
  );
  const metadata = path.join(
    dir,
    "node_modules/koishi-plugin-adapter-onebot/package.json",
  );
  fs.renameSync(metadata, metadata + ".preserved");
  const state = checkInstallation(
    config,
    { version: "v22.19.0" },
    BASE_PACKAGES,
  );
  assert.equal(state.ready, false);
  assert.deepEqual(
    state.missing.map((item) => item.id),
    ["onebot"],
  );
  const store = new ConfigStore(path.join(dir, "settings.json"));
  store.save(config);
  const service = new SetupService(store, {
    busy: new Set(),
    children: new Map(),
  });
  await assert.rejects(
    service.writeConfig("plugins:\n  group:hdsi:\n    hds-interlude: {}\n"),
    /请先完成全部安装.*OneBot/,
  );
  assert.equal(fs.existsSync(path.join(dir, "koishi.yml")), false);
});
