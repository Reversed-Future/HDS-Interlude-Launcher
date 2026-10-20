const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  validateManifest,
  checkRelease,
} = require("../src/update/manifest.cjs");
const {
  readUpdateTarget,
  activateVersion,
} = require("../src/update/bootstrap.cjs");
const { scanPrograms, discover } = require("../src/discovery.cjs");
const { StarCounts } = require("../src/stars.cjs");
const projects = require("../src/about.cjs");
const config = require("../src/update/config.cjs");
const { withDirectRetry } = require("../src/update/retry.cjs");
const { ConfigStore, defaults } = require("../src/config.cjs");
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hds-update-"));
test("a new scaffold still needs configuration even when it already has koishi.yml", () => {
  const {
    markConfiguration,
    needsConfiguration,
  } = require("../src/setup/progress.cjs");
  const directory = temp();
  fs.writeFileSync(path.join(directory, "koishi.yml"), "plugins: {}\n");
  assert.equal(needsConfiguration(directory), false);
  markConfiguration(directory, "pending");
  assert.equal(needsConfiguration(directory), true);
  markConfiguration(directory, "saved");
  assert.equal(needsConfiguration(directory), false);
});
test("a local seed persists across changing to a public build without a seed", () => {
  const root = temp(),
    seed = path.join(root, "seed.json"),
    profile = path.join(root, "profile", "settings.json");
  fs.writeFileSync(seed, JSON.stringify({ ...defaults, koishiDir: root }));
  assert.equal(new ConfigStore(profile, seed).load().koishiDir, root);
  assert.equal(new ConfigStore(profile).load().koishiDir, root);
  fs.writeFileSync(seed, JSON.stringify({ ...defaults, koishiDir: "" }));
  assert.equal(new ConfigStore(profile, seed).load().koishiDir, root);
});
test("public GitHub requests retry rate limits but not cancellation, 404 or other hosts", async () => {
  let calls = 0;
  const direct = async () => {
    calls++;
    return Response.json({ ok: true });
  };
  const fetcher = withDirectRetry(
    async () => new Response("limited", { status: 403 }),
    direct,
  );
  assert.equal((await fetcher(config.api)).status, 200);
  assert.equal(calls, 1);
  assert.equal((await fetcher("https://example.com/file")).status, 403);
  assert.equal(calls, 1);
  assert.equal(
    (
      await withDirectRetry(
        async () => new Response("", { status: 404 }),
        direct,
      )(config.api)
    ).status,
    404,
  );
  assert.equal(calls, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetcher(config.api, { signal: controller.signal }));
  assert.equal(calls, 1);
  const failed = await withDirectRetry(
    async () => new Response("limited", { status: 403 }),
    async () => {
      throw new Error("offline");
    },
  )(config.api);
  assert.equal(failed.status, 403);
  const redirect = await withDirectRetry(
    async () => new Response("limited", { status: 403 }),
    async () =>
      new Response(null, {
        status: 302,
        headers: {
          location: "https://release-assets.githubusercontent.com/file",
        },
      }),
  )(config.url, { redirect: "manual" });
  assert.equal(redirect.status, 302);
});
test("plugin releases prefer GitHub and label the Gitee fallback", async () => {
  const { releases, LINKS } = require("../src/setup/releases.cjs");
  const url =
    "https://github.com/ISEKAI-MomoiCore/HDS-Interlude/releases/download/1.0.1-rc57/plugin.tgz";
  const rows = await releases(async () =>
    Response.json([
      {
        tag_name: "1.0.1-rc57",
        draft: false,
        assets: [{ name: "plugin.tgz", browser_download_url: url }],
      },
    ]),
  );
  assert.equal(rows[0].url, url);
  assert.equal(rows[0].source, "GitHub");
  const urls = [];
  const fallback = await releases(async (url) => {
    urls.push(url);
    return urls.length === 1
      ? new Response("", { status: 403 })
      : new Response(
          fs.readFileSync(
            path.join(__dirname, "fixtures/gitee-releases.html"),
            "utf8",
          ),
        );
  });
  assert.equal(fallback[0].source, "Gitee（备用）");
  assert.equal(urls[1], LINKS.interludeBackup);
});
const manifest = {
  schemaVersion: 1,
  version: "1.3.0",
  platform: "win32",
  arch: "x64",
  asset: "HDS-Interlude-Launcher-1.3.0-win-x64.zip",
  size: 100,
  sha256: "a".repeat(64),
};
const release = {
  tag_name: "v1.3.0",
  draft: false,
  prerelease: false,
  body: "更新说明",
  assets: [
    {
      name: manifest.asset,
      size: 100,
      digest: `sha256:${manifest.sha256}`,
      browser_download_url: `${config.url}/releases/download/v1.3.0/${manifest.asset}`,
    },
    {
      name: config.manifest,
      browser_download_url: `${config.url}/releases/download/v1.3.0/${config.manifest}`,
    },
  ],
};
test("release metadata pins the repository, platform, version, size and digest", async () => {
  assert.equal(validateManifest(manifest, release, "1.2.0").available, true);
  assert.equal(validateManifest(manifest, release, "1.3.0").available, false);
  assert.equal(validateManifest(manifest, release, "1.4.0").available, false);
  for (const patch of [
    { arch: "arm64" },
    { version: "1.4.0" },
    { size: 101 },
    { sha256: "b".repeat(64) },
  ])
    assert.throws(() =>
      validateManifest({ ...manifest, ...patch }, release, "1.2.0"),
    );
  assert.throws(
    () =>
      validateManifest(
        manifest,
        {
          ...release,
          assets: [
            {
              ...release.assets[0],
              browser_download_url:
                "https://github.com/other/repo/releases/download/v1/a.zip",
            },
          ],
        },
        "1.2.0",
      ),
    /本启动器仓库/,
  );
  const urls = [];
  const result = await checkRelease(async (url) => {
    urls.push(url);
    return Response.json(url === config.api ? release : manifest);
  }, "1.2.0");
  assert.equal(result.available, true);
  assert.deepEqual(urls, [config.api, release.assets[1].browser_download_url]);
  await assert.rejects(
    checkRelease(async () => new Response("", { status: 404 }), "1.2.0"),
    /尚未发布/,
  );
});
test("activation preserves settings and selects only a verified newer application inside the profile", () => {
  const profile = temp(),
    directory = path.join(profile, "versions", "1.3.0-test");
  for (const file of [
    config.executable,
    "resources/app/src/main.cjs",
    "resources/app/src/preload.cjs",
    "resources/app/ui/index.html",
  ]) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.writeFileSync(path.join(directory, file), "fixture");
  }
  fs.writeFileSync(
    path.join(directory, "resources/app/package.json"),
    JSON.stringify({
      name: "interlude-launcher",
      productName: "HDS-Interlude Launcher",
      version: "1.3.0",
    }),
  );
  fs.writeFileSync(path.join(profile, "settings.json"), "preserve exactly");
  const exe = activateVersion(profile, { directory, version: "1.3.0" });
  assert.equal(readUpdateTarget(profile, "1.2.0"), exe);
  assert.equal(readUpdateTarget(profile, "1.3.0"), null);
  assert.equal(
    fs.readFileSync(path.join(profile, "settings.json"), "utf8"),
    "preserve exactly",
  );
  assert.throws(
    () =>
      activateVersion(profile, {
        directory: path.dirname(profile),
        version: "1.3.0",
      }),
    /无效/,
  );
  fs.writeFileSync(path.join(profile, "active-version.json"), "broken");
  assert.equal(readUpdateTarget(profile, "1.2.0"), null);
});
test("discovery recognizes concrete files, returns multiple installations and tolerates QQ detection failure", async () => {
  const root = temp();
  for (const name of ["first", "second"]) {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, "node_modules/koishi"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "node_modules/koishi/package.json"),
      JSON.stringify({ name: "koishi", version: "4.18.0" }),
    );
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { start: "koishi start" } }),
    );
    fs.mkdirSync(path.join(dir, "data"));
    fs.writeFileSync(path.join(dir, "data/koishi.db"), "fixture");
  }
  const snow = path.join(root, "snow");
  fs.mkdirSync(snow);
  for (const name of ["launcher.bat", "index.mjs", "check-node-version.cjs"])
    fs.writeFileSync(path.join(snow, name), "fixture");
  const result = scanPrograms([root, root]);
  assert.deepEqual(result.koishiDir, [
    path.join(root, "first"),
    path.join(root, "second"),
  ]);
  assert.equal(result.databasePath.length, 2);
  assert.deepEqual(result.snowlumaDir, [snow]);
  const failed = await discover({}, [root], async () => {
    throw new Error("registry unavailable");
  });
  assert.deepEqual(failed.qqExe, []);
  assert.ok(failed.qqError);
});
test("GitHub stars keep zero, cache for one hour, and retain stale counts offline", async () => {
  const profile = temp();
  const urls = [];
  const stars = new StarCounts(profile, async (url) => {
    urls.push(url);
    return Response.json({
      stargazers_count: url.includes("ISEKAI-MomoiCore") ? 43 : 0,
    });
  });
  const [first, concurrent] = await Promise.all([stars.load(), stars.load()]);
  assert.deepEqual(first, concurrent);
  assert.equal(urls.length, projects.length);
  assert.ok(
    urls.includes(
      "https://api.github.com/repos/ISEKAI-MomoiCore/HDS-Interlude",
    ),
  );
  assert.equal(first.launcher.count, 0);
  assert.equal(first.hdsi.count, 43);
  await stars.load();
  assert.equal(urls.length, projects.length);
  for (const value of Object.values(first))
    value.checkedAt = Date.now() - 3600001;
  fs.writeFileSync(stars.file, JSON.stringify(first));
  const offline = new StarCounts(profile, async () => {
    throw new Error("offline");
  });
  const cached = await offline.load();
  assert.equal(cached.launcher.count, 0);
  assert.equal(cached.launcher.stale, true);
  const absent = await new StarCounts(temp(), async () =>
    Response.json({ invalid: 123 }),
  ).load();
  assert.equal(absent.launcher.count, null);
});
