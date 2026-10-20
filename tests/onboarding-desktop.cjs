const { _electron } = require("@playwright/test");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { defaults } = require("../src/config.cjs");
const root = path.resolve(__dirname, ".."),
  artifacts = path.join(root, "test-results", "onboarding-" + Date.now());
const { config } = require("./demo.cjs").createDemo(artifacts);
fs.writeFileSync(path.join(config.koishiDir, "koishi.yml"), "plugins: {}\n");
const profile = path.join(artifacts, "profile");
fs.writeFileSync(path.join(profile, "settings.json"), JSON.stringify(defaults));
(async () => {
  const app = await _electron.launch({
    args: [root],
    env: { ...process.env, INTERLUDE_TEST_PROFILE: profile },
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.locator("#page-setup").waitFor({ state: "visible" });
    await page
      .locator("#assistant-next")
      .filter({ hasText: "下载并安装 QQ" })
      .waitFor();
    assert.equal(await page.locator(".eyebrow").count(), 0);
    assert.equal(
      await page.locator('[data-env="koishi"] span').textContent(),
      "尚未选择程序位置",
    );
    assert.equal(
      await page.locator(".readiness-details").getAttribute("open"),
      null,
    );
    assert.equal(await page.locator("#readiness-list").isVisible(), false);
    await page.screenshot({ path: path.join(artifacts, "first-run.png") });
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, path.dirname(config.koishiDir));
    await page.locator("#assistant-folder").click();
    await page
      .locator("#assistant-result")
      .filter({ hasText: "已识别并保存" })
      .waitFor();
    // QQ is an executable selected through its own system discovery; preserve the
    // fixture path explicitly instead of ever using the machine's real QQ.
    await page.evaluate(
      async (cfg) => window.launcher.saveConfig({ ...cfg, qqExe: cfg.qqExe }),
      config,
    );
    await page.reload();
    await page.locator('[data-route="setup"]').click();
    await page
      .locator("#assistant-next")
      .filter({ hasText: "前往启动台" })
      .waitFor();
    await page.locator("#assistant-next").click();
    await page.locator("#page-dashboard").waitFor({ state: "visible" });
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(profile, "settings.json")))
        .koishiDir,
      config.koishiDir,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: empty profile, clear path state, folder discovery, persistence and next-step navigation",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
