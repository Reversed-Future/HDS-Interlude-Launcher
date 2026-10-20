const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { onebotServer } = require("./onebot-fixture.cjs");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(
  root,
  "test-results",
  `startup-desktop-${Date.now()}`,
);
fs.mkdirSync(artifacts, { recursive: true });
const { config, profile } = require("./demo.cjs").createDemo(artifacts);

async function run() {
  const state = { online: false };
  const server = onebotServer(state);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  config.koishiUrl = "";
  config.snowlumaUrl = "";
  fs.writeFileSync(path.join(profile, "settings.json"), JSON.stringify(config));
  fs.writeFileSync(
    path.join(config.koishiDir, "koishi.yml"),
    `plugins:\n  adapter-onebot: {protocol: ws, selfId: 123456, endpoint: "ws://127.0.0.1:${server.address().port}"}\n`,
  );
  fs.writeFileSync(
    path.join(config.snowlumaDir, "launcher.bat"),
    "@echo off\r\nnode fixture.cjs\r\n",
  );
  fs.writeFileSync(
    path.join(config.snowlumaDir, "fixture.cjs"),
    `const http = require('node:http'); if(process.env.SNOWLUMA_HOOK_AUTOLOAD !== '1') process.exit(9); const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>自动发现 SnowLuma</h1>')}); server.listen(0,'127.0.0.1',()=>{ process.stdout.write('INFO [WebUI] listen'); setTimeout(()=>console.log('ing http://127.0.0.1:'+server.address().port),150); });`,
  );
  fs.writeFileSync(
    path.join(config.koishiDir, "demo.cjs"),
    `require('node:fs').writeFileSync('started.txt','yes'); console.log('[I] console webui is available at http://127.0.0.1:${server.address().port}'); setInterval(()=>{},1000);`,
  );
  const app = await electron.launch({
    args: [root],
    env: { ...process.env, INTERLUDE_TEST_PROFILE: profile },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    // Only QQ is stubbed. Actual cmd/npm/bat capture and Electron IPC are exercised.
    await app.evaluate(({ app }, directory) => {
      const { ProcessManager } = process.mainModule.require(
        directory + "/src/processes.cjs",
      );
      const start = ProcessManager.prototype.start;
      ProcessManager.prototype.start = async function (id, config) {
        if (id !== "qq") return start.call(this, id, config);
        this.state(id, { phase: "opened", message: "测试 QQ 已打开" });
        return this.snapshot();
      };
    }, root);
    await page
      .locator("#path-koishi")
      .filter({ hasText: config.koishiDir })
      .waitFor();
    await page.locator("#start-all").click();
    await page
      .locator("#startup-message")
      .filter({ hasText: "无需手动" })
      .waitFor();
    assert.equal(
      fs.existsSync(path.join(config.koishiDir, "started.txt")),
      false,
    );
    assert.equal(await page.locator("#start-all").isDisabled(), true);
    await page.locator('[data-route="webui"]').click();
    await page.locator('[data-web-tab="snowluma"]').click();
    await page.waitForFunction(() =>
      document
        .querySelector("#web-address")
        .textContent.startsWith("http://127.0.0.1:"),
    );
    const snowAddress = await page.locator("#web-address").textContent();
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(profile, "settings.json")))
        .snowlumaUrl,
      snowAddress,
    );
    await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      for (let count = 0; count < 60; count++) {
        const view = window.contentView.children.find((item) =>
          item.webContents?.getURL().startsWith("http://127.0.0.1:"),
        );
        if (
          view &&
          (await view.webContents.executeJavaScript(
            'document.body?.textContent.includes("自动发现 SnowLuma")',
          ))
        )
          return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Discovered WebUI did not load automatically");
    });
    state.online = true;
    await page.locator('[data-route="dashboard"]').click();
    await page
      .locator("#startup-message")
      .filter({ hasText: "Koishi 已启动" })
      .waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-status="koishi"]').dataset.phase ===
        "running",
    );
    await page.locator('[data-route="webui"]').click();
    await page.locator('[data-web-tab="koishi"]').click();
    await page.waitForFunction(
      (address) =>
        document.querySelector("#web-address").textContent === address,
      `http://127.0.0.1:${server.address().port}/`,
    );
    assert.ok(fs.existsSync(path.join(config.koishiDir, "started.txt")));
    await page.locator('[data-route="dashboard"]').click();
    await page.screenshot({ path: path.join(artifacts, "ready.png") });
    assert.deepEqual(errors, []);
    console.log(
      "Sequential startup, automatic injection environment and live WebUI discovery passed.",
    );
  } finally {
    await page.evaluate(async () => {
      await window.launcher.cancelStartup();
    });
    // Wait for a pending request to leave the cancellation boundary.
    await page.waitForFunction(
      () => document.querySelector("#startup-cancel").hidden,
    );
    await page.evaluate(() => window.launcher.stopAll());
    await app.close();
    await server.dispose();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
