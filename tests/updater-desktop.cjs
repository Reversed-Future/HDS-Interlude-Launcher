// Exercise the packaged updater with an actual release ZIP and isolated data.
const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const build = JSON.parse(
  fs.readFileSync(path.join(root, "release/latest.json"), "utf8"),
);
const assets = JSON.parse(
  fs.readFileSync(path.join(root, "release/assets.json"), "utf8"),
);
const artifacts = path.join(root, "test-results", `updater-${Date.now()}`);
fs.mkdirSync(artifacts, { recursive: true });
const { config, profile } = require("./demo.cjs").createDemo(artifacts);
const before = fs.readFileSync(path.join(profile, "settings.json"));
(async () => {
  const app = await electron.launch({
    executablePath: process.env.HDS_UPDATER_TEST_EXECUTABLE || build.executable,
    args: [],
    env: { ...process.env, INTERLUDE_TEST_PROFILE: profile },
  });
  let executable;
  try {
    const page = await app.firstWindow();
    await page
      .locator("#path-koishi")
      .filter({ hasText: config.koishiDir })
      .waitFor();
    await app.evaluate(({ app }, assets) => {
      const require = process
        .getBuiltinModule("module")
        .createRequire(app.getAppPath() + "/package.json");
      const fs = require("node:fs"),
        path = require("node:path");
      const { UpdateService } = require("./src/update/service.cjs");
      const source = require("./src/update/config.cjs");
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(assets.directory, "launcher-update.json"),
          "utf8",
        ),
      );
      const assetURL = `${source.url}/releases/download/v${manifest.version}/${manifest.asset}`;
      const manifestURL = `${source.url}/releases/download/v${manifest.version}/${source.manifest}`;
      const release = {
        tag_name: `v${manifest.version}`,
        draft: false,
        prerelease: false,
        body: "隔离测试：实际发行包更新",
        assets: [
          {
            name: manifest.asset,
            size: manifest.size,
            digest: `sha256:${manifest.sha256}`,
            browser_download_url: assetURL,
          },
          { name: source.manifest, browser_download_url: manifestURL },
        ],
      };
      const original = UpdateService.prototype.check;
      UpdateService.prototype.check = function () {
        this.version = "1.2.0";
        this.fetcher = async (url) => {
          if (url === source.api) return Response.json(release);
          if (url === manifestURL) return Response.json(manifest);
          if (url === assetURL)
            return new Response(
              fs.readFileSync(path.join(assets.directory, manifest.asset)),
              { headers: { "content-length": String(manifest.size) } },
            );
          throw new Error("Unexpected test URL");
        };
        return original.call(this);
      };
      globalThis.originalExit = app.exit;
      app.relaunch = (options) => {
        globalThis.testRelaunch = options;
      };
      app.exit = (code) => {
        globalThis.testExit = code;
      };
    }, assets);
    await page.locator('[data-route="setup"]').click();
    await page.locator("#check-launcher-update").click();
    await page
      .locator('#launcher-update-status[data-phase="available"]')
      .waitFor();
    await page.locator("#install-launcher-update").click();
    await page.waitForFunction(
      () =>
        ["ready", "error"].includes(
          document.querySelector("#launcher-update-status")?.dataset.phase,
        ),
      null,
      { timeout: 120000 },
    );
    assert.equal(
      await page.locator("#launcher-update-status").getAttribute("data-phase"),
      "ready",
      await page.locator("#launcher-update-status").textContent(),
    );
    assert.equal(
      await page.locator("#page-setup").isVisible(),
      true,
      JSON.stringify(
        await page.evaluate(() => ({
          breadcrumb: document.querySelector("#breadcrumb").textContent,
          hidden: [...document.querySelectorAll(".page")].map((x) => [
            x.id,
            x.hidden,
          ]),
        })),
      ),
    );
    await page.locator("#restart-launcher-update").click();
    const restarted = await app.evaluate(() => ({
      options: globalThis.testRelaunch,
      code: globalThis.testExit,
    }));
    assert.equal(restarted.code, 0);
    assert.deepEqual(restarted.options.args, []);
    executable = restarted.options.execPath;
    assert.ok(executable.startsWith(path.join(profile, "versions") + path.sep));
    assert.deepEqual(
      fs.readFileSync(path.join(profile, "settings.json")),
      before,
    );
    assert.equal(
      require("../src/update/bootstrap.cjs").readUpdateTarget(profile, "1.2.0"),
      executable,
    );
  } catch (error) {
    console.error(error.message);
    const page = await app.firstWindow().catch(() => null);
    if (page)
      console.error(
        await page
          .evaluate(() => ({
            update: document.querySelector("#launcher-update-status")
              ?.outerHTML,
            message: document.querySelector("#setup-message")?.textContent,
            visiblePages: [...document.querySelectorAll(".page")]
              .filter((node) => !node.hidden)
              .map((node) => node.id),
          }))
          .catch(() => null),
      );
    throw error;
  } finally {
    await app
      .evaluate(({ app }) => {
        if (globalThis.originalExit) app.exit = globalThis.originalExit;
      })
      .catch(() => {});
    await app.close();
  }
  const updated = await electron.launch({
    executablePath: executable,
    args: [],
    env: { ...process.env, INTERLUDE_TEST_PROFILE: profile },
  });
  try {
    const page = await updated.firstWindow();
    await page
      .locator("#path-koishi")
      .filter({ hasText: config.koishiDir })
      .waitFor();
    await page.locator('[data-route="reader"]').click();
    await page.locator(".entry-content").first().waitFor();
    assert.equal(
      await updated.evaluate(({ app }) => app.getVersion()),
      require("../package.json").version,
    );
    console.log(
      "PASS: packaged update UI, real ZIP checksum/extraction, activation, relaunch arguments, updated EXE launch and preserved settings/database.",
    );
  } finally {
    await updated.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
