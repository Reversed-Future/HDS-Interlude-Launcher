const { _electron: electron } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "test-results", `screenshots-${Date.now()}`);
fs.mkdirSync(artifacts, { recursive: true });
const { config, profile } = require("../tests/demo.cjs").createDemo(artifacts);
if (process.env.HDS_SCREENSHOT_STAR_CACHE)
  fs.copyFileSync(
    process.env.HDS_SCREENSHOT_STAR_CACHE,
    path.join(profile, "repository-stars.json"),
  );
const output = path.join(root, "docs/screenshots");
fs.mkdirSync(output, { recursive: true });
(async () => {
  const app = await electron.launch({
    args: [root],
    env: { ...process.env, INTERLUDE_TEST_PROFILE: profile },
  });
  try {
    const page = await app.firstWindow();
    await page
      .locator("#path-koishi")
      .filter({ hasText: config.koishiDir })
      .waitFor();
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Replace only visible synthetic paths for portable documentation screenshots.
    await page.evaluate(() => {
      document.querySelector("#path-koishi").textContent =
        "C:\\HDS-Interlude\\koishi";
      document.querySelector("#path-snowluma").textContent =
        "C:\\HDS-Interlude\\SnowLuma";
      document.querySelector("#path-qq").textContent =
        "C:\\Program Files\\QQNT\\QQ.exe";
    });
    await page.screenshot({ path: path.join(output, "launcher.png") });
    await page.locator('[data-route="reader"]').click();
    await page.locator(".entry-content").first().waitFor();
    await page.screenshot({ path: path.join(output, "reader.png") });
    await page.locator('[data-route="setup"]').click();
    await page
      .locator("#readiness-title")
      .filter({ hasText: "安装已完成" })
      .waitFor();
    await page.screenshot({ path: path.join(output, "setup.png") });
    await page.locator('[data-route="guide"]').click();
    await page.locator('[data-config-key="botQQ"]').fill("123456789");
    await page.locator('[data-config-key="wsToken"]').fill("demo-token");
    await page.locator("#wizard-next").click();
    await page.locator('[data-config-key="label"]').first().fill("主叙事模型");
    await page
      .locator('[data-config-key="model"]')
      .first()
      .fill("服务商提供的模型名称");
    await page
      .locator('[data-config-key="endpoint"]')
      .first()
      .fill("https://example.com/v1/chat/completions");
    await page.screenshot({ path: path.join(output, "configuration.png") });
    await page.locator('[data-route="settings"]').click();
    await page.evaluate(() => {
      const demo = {
        koishiDir: "C:\\HDS-Interlude\\koishi",
        snowlumaDir: "C:\\HDS-Interlude\\SnowLuma",
        qqExe: "C:\\Program Files\\QQNT\\QQ.exe",
        databasePath: "C:\\HDS-Interlude\\koishi\\data\\koishi.db",
      };
      for (const [key, value] of Object.entries(demo))
        document.getElementById(key).value = value;
    });
    await page.locator(".about-card").scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-project-stars="koishi"]').textContent !==
        "—",
      { timeout: 30000 },
    );
    await page.screenshot({ path: path.join(output, "about.png") });
    console.log(output);
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
