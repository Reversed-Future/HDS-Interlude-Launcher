const { _electron: electron } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const release = JSON.parse(
  fs.readFileSync(path.join(root, "release/latest.json"), "utf8"),
);
const artifacts = path.join(root, "test-results", `packaged-${Date.now()}`);
fs.mkdirSync(artifacts, { recursive: true });
const { config } = require("../tests/demo.cjs").createDemo(artifacts);
(async () => {
  const app = await electron.launch({
    executablePath: release.executable,
    args: [],
    artifactsDir: artifacts,
    env: {
      ...process.env,
      INTERLUDE_TEST_PROFILE: path.join(artifacts, "profile"),
    },
  });
  try {
    const window = await app.firstWindow();
    await window
      .locator("#path-koishi")
      .filter({ hasText: config.koishiDir })
      .waitFor();
    await window.locator('[data-route="reader"]').click();
    await window.locator(".entry-content").first().waitFor();
    assert.ok((await window.locator(".entry-content").count()) > 0);
    await window.locator('[data-route="setup"]').click();
    await window
      .locator("#installed-version")
      .filter({ hasText: "1.0.1-rc28" })
      .waitFor();
    await window.locator('[data-route="guide"]').click();
    await window.locator('[data-config-key="botQQ"]').waitFor();
    assert.equal(await window.locator("iframe").count(), 0);
    await window.screenshot({
      path: path.join(artifacts, "configuration.png"),
    });
    await window.locator('[data-route="dashboard"]').click();
    await window.screenshot({ path: path.join(artifacts, "launcher.png") });
    console.log(
      "PASS: packaged EXE opens, settings load, SQLite worker reads real DB.",
    );
    console.log("Executable:", release.executable);
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
