const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createManagementFixture } = require("./management-fixture.cjs");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(
  root,
  "test-results",
  "management-desktop-" + Date.now(),
);
fs.mkdirSync(artifacts, { recursive: true });
const { config, profile } = require("./demo.cjs").createDemo(artifacts);

async function run() {
  const fixture = createManagementFixture(config.koishiDir);
  const address = await fixture.start();
  config.koishiUrl = address + "/console";
  config.snowlumaUrl = address;
  fs.writeFileSync(path.join(profile, "settings.json"), JSON.stringify(config));
  const app = await electron.launch({
    args: [root],
    env: { ...process.env, INTERLUDE_TEST_PROFILE: profile },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const done = async () =>
    page.waitForFunction(
      () =>
        document.querySelector("#manage-content").getAttribute("aria-busy") ===
        "false",
    );
  try {
    await page
      .locator("#path-koishi")
      .filter({ hasText: config.koishiDir })
      .waitFor();
    await page.getByRole("button", { name: "常用管理", exact: true }).click();
    await done();
    await page.locator('[data-manage-tab="plugins"]').click();
    await page.locator('#manage-koishi [data-field="username"]').fill("admin");
    await page
      .locator('#manage-koishi [data-field="password"]')
      .fill("test-password");
    await page
      .locator("#manage-koishi")
      .getByRole("button", { name: "登录", exact: true })
      .click();
    await done();
    await page.locator('[data-manage-tab="qq"]').click();
    await page
      .locator('#manage-snow [data-field="password"]')
      .fill("test-password");
    await page
      .locator("#manage-snow")
      .getByRole("button", { name: "登录", exact: true })
      .click();
    await done();
    await page
      .locator("#manage-snow")
      .getByText("已登录", { exact: true })
      .waitFor();
    await page.locator('[data-manage-tab="plugins"]').click();
    await page
      .locator("#manage-koishi .manage-plugin")
      .filter({ hasText: "hds-interlude" })
      .getByRole("button", { name: "修改配置" })
      .click();
    await done();
    await page
      .locator('#manage-editor [data-field="storyDefaults.characterName"]')
      .fill("原生表单角色");
    await page
      .locator("#manage-editor")
      .getByRole("button", { name: "备份并保存", exact: true })
      .click();
    await done();
    let hdsi = fixture.state.config.plugins["group:app"]["hds-interlude:test"];
    assert.equal(hdsi.storyDefaults.characterName, "原生表单角色");
    assert.equal(hdsi.storyDefaults.style, "保留的高级字段");
    assert.equal(
      fs.existsSync(path.join(config.koishiDir, "koishi.yml.bak")),
      true,
    );
    assert.ok(
      !(await page.locator("#manage-content").innerText()).includes(
        "demo-secret",
      ),
    );
    await page
      .locator('#manage-editor [data-field="useForEmbedding"]')
      .selectOption("true");
    assert.equal(
      await page
        .locator('#manage-editor [data-field="useForMain"]')
        .inputValue(),
      "false",
    );
    await page
      .locator('#manage-editor [data-field="useForMain"]')
      .selectOption("true");
    await page
      .locator("#manage-editor")
      .getByRole("button", { name: "备份并保存", exact: true })
      .click();
    await done();
    assert.ok(
      (await page.locator("#manage-message").textContent()).includes(
        "专用向量",
      ),
    );
    assert.equal(
      fixture.state.config.plugins["group:app"]["hds-interlude:test"].model
        .providers[0].useForEmbedding,
      undefined,
    );
    await page
      .locator('#manage-editor [data-field="useForMain"]')
      .selectOption("false");
    await page
      .locator('#manage-editor [data-field="model"]')
      .fill("example-embedding-model");
    await page
      .locator("#manage-editor")
      .getByRole("button", { name: "备份并保存", exact: true })
      .click();
    await done();
    assert.equal(
      fixture.state.config.plugins["group:app"]["hds-interlude:test"].model
        .providers[0].useForEmbedding,
      true,
    );
    await page.locator('[data-manage-tab="qq"]').click();
    await page
      .locator("#manage-snow")
      .getByRole("button", { name: "读取 OneBot 节点" })
      .click();
    await done();
    await page.locator('#manage-snow-editor [data-field="port"]').fill("3105");
    await page
      .locator("#manage-snow-editor")
      .getByRole("button", { name: "备份并保存节点" })
      .click();
    await done();
    await page
      .locator("#manage-snow-editor")
      .getByRole("button", { name: "同步到 Koishi", exact: true })
      .click();
    await done();
    assert.equal(
      fixture.state.config.plugins["group:app"]["adapter-onebot:test"].endpoint,
      "ws://127.0.0.1:3105/",
    );
    await page.locator('[data-manage-tab="plugins"]').click();
    const help = page
      .locator("#manage-koishi .manage-plugin")
      .filter({ hasText: /^help/ });
    await help.getByRole("button", { name: "停用", exact: true }).click();
    await done();
    assert.ok(
      Object.hasOwn(fixture.state.config.plugins["group:app"], "~help:test"),
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(artifacts, "native-management.png"),
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(980, 690),
    );
    await page.waitForFunction(() => innerWidth < 1000);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: path.join(artifacts, "native-management-compact.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: native logins, QQ status, preserved HDSI fields, backup, embedding restriction, OneBot sync, plugin toggle and compact layout.",
    );
  } finally {
    await app.close();
    await fixture.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
