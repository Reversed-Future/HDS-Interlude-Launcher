const { _electron: electron } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const tar = require("tar");
const YAML = require("yaml");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(
  root,
  "test-results",
  `setup-desktop-${Date.now()}`,
);
fs.mkdirSync(artifacts, { recursive: true });
require("./demo.cjs").createDemo(artifacts);
const target = path.join(artifacts, "Koishi 中文 & 空格");
fs.mkdirSync(target);
fs.writeFileSync(
  path.join(target, "package.json"),
  JSON.stringify({
    name: "hds-desktop-fixture",
    version: "1.0.0",
    scripts: { start: "node index.js" },
  }),
);
fs.writeFileSync(path.join(target, "koishi.yml"), "fixture: original\n");
const packageDir = path.join(artifacts, "package");
fs.mkdirSync(packageDir);
fs.writeFileSync(
  path.join(packageDir, "package.json"),
  JSON.stringify({
    name: "koishi-plugin-hds-interlude",
    version: "1.0.1-rc28",
  }),
);
const file = path.join(artifacts, "测试包 & 插件.tgz");
async function run() {
  await tar.c({ file, gzip: true, cwd: artifacts }, ["package"]);
  const app = await electron.launch({
    args: [root],
    env: {
      ...process.env,
      INTERLUDE_TEST_PROFILE: path.join(artifacts, "profile"),
    },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page
      .locator("#path-koishi")
      .filter({ hasText: "HDS-Interlude" })
      .waitFor();
    await page.locator('[data-route="settings"]').click();
    await page.locator("#koishiDir").fill(target);
    await page.locator("#koishiUrl").fill("");
    await page.locator("#save-settings").click();
    await page
      .locator("#notice-text")
      .filter({ hasText: "设置已保存" })
      .waitFor();
    await page.locator('[data-route="setup"]').click();
    await page
      .locator("#installed-version")
      .filter({ hasText: "未检测到 HDSI" })
      .waitFor();
    await page.locator('[data-route="guide"]').click();
    await page
      .locator("#readiness-title")
      .filter({ hasText: "还有项目需要准备" })
      .waitFor();
    assert.equal(await page.locator("#page-guide").isVisible(), false);
    assert.equal(
      await page.locator("[data-requires-ready]").first().isDisabled(),
      true,
    );
    const blockedWrite = await page.evaluate(async () => {
      try {
        await window.launcher.writeYaml(
          "plugins:\n  group:hdsi:\n    hds-interlude: {}\n",
        );
        return "unexpected success";
      } catch (error) {
        return error.message;
      }
    });
    assert.ok(blockedWrite.includes("请先完成全部安装"));
    await page.screenshot({
      path: path.join(artifacts, "configuration-locked.png"),
    });
    await app.evaluate(({ shell }) => {
      shell.openPath = async () => "";
    });
    await page.locator("details.setup-disclosure > summary").click();
    await page.locator("#install-official-qq").click();
    await page.locator("#download-panel").waitFor({ state: "visible" });
    await page
      .locator("#download-panel")
      .screenshot({ path: path.join(artifacts, "download-progress.png") });
    await page.locator("#cancel-download").click();
    await page
      .locator("#setup-log")
      .filter({ hasText: "下载已取消" })
      .waitFor();
    await page.locator("#download-panel").waitFor({ state: "hidden" });
    await page.locator("#tgz-file").setInputFiles(file);
    await page
      .locator("#plan-version")
      .filter({ hasText: "1.0.1-rc28" })
      .waitFor();
    assert.ok(
      (await page.locator("#plan-command").textContent()).includes(
        "--save-exact",
      ),
    );
    await page.locator("#install-package").click();
    await page
      .locator("#setup-status")
      .filter({ hasText: "安装 HDSI 插件：完成" })
      .waitFor({ timeout: 240000 });
    await page
      .locator("#installed-version")
      .filter({ hasText: "1.0.1-rc28" })
      .waitFor();
    await page
      .locator("#readiness-title")
      .filter({ hasText: "安装已完成" })
      .waitFor();
    assert.equal(
      await page.locator("[data-requires-ready]").first().isEnabled(),
      true,
    );
    await page.locator("#refresh-environment").click();
    await page
      .locator("#notice-text")
      .filter({ hasText: "环境已刷新" })
      .waitFor();
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(
            target,
            "node_modules/koishi-plugin-hds-interlude/package.json",
          ),
          "utf8",
        ),
      ).version,
      "1.0.1-rc28",
    );
    await page.locator("#check-beta").click();
    await page
      .locator("#plan-detail")
      .filter({ hasText: "npm beta" })
      .waitFor({ timeout: 40000 });
    await page.screenshot({ path: path.join(artifacts, "setup.png") });
    await page.locator('[data-route="guide"]').click();
    assert.equal(await page.locator("iframe").count(), 0);
    await page.locator('[data-config-step="0"]').waitFor();
    await page.locator("#preview-yaml").click();
    await page.locator("#yaml-dialog").waitFor({ state: "visible" });
    assert.equal(await page.locator("#write-yaml").isDisabled(), true);
    await page.locator("#close-yaml").click();
    await page.locator('[data-config-key="wsToken"]').fill("fixture-token");
    await page.locator('[data-config-key="botQQ"]').fill("123456789");
    await page.screenshot({
      path: path.join(artifacts, "native-connection.png"),
    });
    await page.locator("#wizard-next").click();
    await page
      .locator('[data-config-key="apiKey"]')
      .first()
      .fill("fixture-key");
    await page
      .locator('[data-config-key="endpoint"]')
      .first()
      .fill("https://example.com/v1/chat/completions");
    await page
      .locator('[data-config-key="model"]')
      .first()
      .fill("fixture-model");
    await page
      .locator('[data-config-key="label"]')
      .first()
      .fill('引号 " <测试>');
    await page.screenshot({ path: path.join(artifacts, "native-models.png") });
    await page.locator('[data-config-key="useStickers"]').first().check();
    await page.locator("#add-provider").click();
    const embedding = page.locator('[data-provider-index="1"]');
    await embedding.locator('[data-config-key="useEmbedding"]').check();
    assert.ok(
      (await embedding.locator(".embedding-notice").textContent()).includes(
        "必须填写专用",
      ),
    );
    for (const key of [
      "useMain",
      "useCompaction",
      "useAlter",
      "useStickers",
      "useVision",
    ]) {
      assert.equal(
        await embedding.locator(`[data-config-key="${key}"]`).isDisabled(),
        true,
      );
      assert.equal(
        await embedding.locator(`[data-config-key="${key}"]`).isChecked(),
        false,
      );
    }
    await embedding
      .locator('[data-config-key="model"]')
      .fill("fixture-embedding");
    await embedding
      .locator('[data-config-key="apiKey"]')
      .fill("fixture-embedding-key");
    await embedding
      .locator('[data-config-key="endpoint"]')
      .fill("https://example.com/v1/chat/completions");
    await embedding.screenshot({ path: path.join(artifacts, "embedding.png") });
    await page.locator("#wizard-next").click();
    await page.locator('[data-config-key="charName"]').fill("测试角色");
    await page.locator('[data-config-key="userQQ"]').fill("987654321");
    await page.screenshot({ path: path.join(artifacts, "guide.png") });
    await page.locator('[data-config-step="3"]').click();
    assert.equal(
      await page.locator("#sticker-directory-panel").isVisible(),
      false,
    );
    await page.locator('[data-config-key="stickers"]').check();
    await page
      .locator("#sticker-directory-status")
      .filter({ hasText: "目录尚未创建" })
      .waitFor();
    const stickerDirectory = path.join(
      target,
      "data",
      "hds-interlude",
      "stickers",
    );
    assert.equal(
      await page.locator("#sticker-directory-path").textContent(),
      stickerDirectory,
    );
    await page.locator("#create-sticker-directory").click();
    await page
      .locator("#sticker-directory-status")
      .filter({ hasText: "目录已准备好" })
      .waitFor();
    assert.equal(fs.statSync(stickerDirectory).isDirectory(), true);
    fs.writeFileSync(path.join(stickerDirectory, "preserved.txt"), "keep");
    await app.evaluate(({ shell }) => {
      shell.openPath = async (file) => {
        globalThis.hdsOpenedStickerDirectory = file;
        return "";
      };
    });
    await page.locator("#open-sticker-directory").click();
    assert.equal(
      await app.evaluate(() => globalThis.hdsOpenedStickerDirectory),
      stickerDirectory,
    );
    await page
      .locator("#sticker-directory-panel")
      .screenshot({ path: path.join(artifacts, "stickers.png") });
    await page.locator('[data-config-key="stickers"]').uncheck();
    assert.equal(
      await page.locator("#sticker-directory-panel").isVisible(),
      false,
    );
    assert.equal(
      fs.readFileSync(path.join(stickerDirectory, "preserved.txt"), "utf8"),
      "keep",
    );
    await page.locator('[data-config-key="stickers"]').check();
    await page.locator("#preview-yaml").click();
    await page.locator("#yaml-dialog").waitFor({ state: "visible" });
    assert.equal(await page.locator("#write-yaml").isEnabled(), true);
    const yaml = await page.locator("#yaml-preview").inputValue();
    const config = YAML.parse(yaml);
    const embeddingProvider =
      config.plugins["group:hdsi"]["hds-interlude"].model.providers[1];
    assert.equal(embeddingProvider.useForEmbedding, true);
    for (const key of [
      "useForMain",
      "useForCompaction",
      "useForAlter",
      "useForStickers",
      "useForVision",
    ])
      assert.equal(embeddingProvider[key], false);
    assert.equal(
      config.plugins["group:adapter"]["adapter-onebot"].selfId,
      "123456789",
    );
    assert.ok(config.plugins["group:hdsi"]["hds-interlude"]);
    assert.ok(
      config.plugins["group:hdsi"][
        "hds-interlude"
      ].model.providers[0].label.includes("<测试>"),
    );
    const draft = await page.evaluate(() =>
      localStorage.getItem("hdsLauncherConfigurationV1"),
    );
    assert.ok(
      !draft.includes("fixture-key") && !draft.includes("fixture-token"),
    );
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    await page.locator("#write-yaml").click();
    await page.locator("#yaml-dialog").waitFor({ state: "hidden" });
    assert.equal(
      fs.readFileSync(path.join(target, "koishi.yml"), "utf8"),
      yaml,
    );
    assert.equal(
      fs.readFileSync(path.join(target, "koishi.yml.bak"), "utf8"),
      "fixture: original\n",
    );
    assert.equal(
      fs.readFileSync(path.join(stickerDirectory, "preserved.txt"), "utf8"),
      "keep",
    );
    const backups = fs.readdirSync(path.join(target, ".hds-launcher-backups"));
    assert.ok(backups.length >= 2);
    assert.ok(
      backups.some(
        (name) =>
          fs.readFileSync(
            path.join(target, ".hds-launcher-backups", name, "koishi.yml"),
            "utf8",
          ) === "fixture: original\n",
      ),
    );
    await page.locator('[data-route="setup"]').click();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(980, 690);
    });
    await page.screenshot({ path: path.join(artifacts, "setup-compact.png") });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: file import, actual npm update in fixture, online beta check, guide validation, generated YAML, backup and write, compact layout.",
    );
    console.log("Artifacts:", artifacts);
  } finally {
    await app.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
