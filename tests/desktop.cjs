const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "test-results", `desktop-${Date.now()}`);
fs.mkdirSync(artifacts, { recursive: true });
const { config } = require("./demo.cjs").createDemo(artifacts);
const server = http.createServer((_request, response) => {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
  });
  response.end(
    "<!doctype html><html><body><h1>内嵌网页验证通过</h1></body></html>",
  );
});
async function run() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const app = await electron.launch({
    args: [root],
    env: {
      ...process.env,
      INTERLUDE_TEST_PROFILE: path.join(artifacts, "profile"),
    },
    artifactsDir: artifacts,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page
      .locator("#path-koishi")
      .filter({ hasText: config.koishiDir })
      .waitFor();
    assert.equal(await page.title(), "HDS-Interlude Launcher");
    assert.ok(
      await page
        .locator(".dashboard-bottom")
        .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
    );
    await page.screenshot({ path: path.join(artifacts, "01-launcher.png") });
    await page.getByRole("button", { name: "剧本书架" }).click();
    await page.locator(".story-choice").first().waitFor();
    await page.locator(".entry-content").first().waitFor();
    await page.screenshot({ path: path.join(artifacts, "05-reader.png") });
    assert.ok(Number(await page.locator("#story-count").textContent()) > 0);
    const first = await page.locator(".entry-content").first().textContent();
    await page.getByRole("button", { name: "下一页" }).click();
    await page.waitForFunction(
      (text) =>
        document.querySelector(".entry-content")?.textContent !== text &&
        !!document.querySelector(".entry-content"),
      first,
    );
    await page.getByRole("button", { name: "上一页" }).click();
    await page.waitForFunction(
      (text) => document.querySelector(".entry-content")?.textContent === text,
      first,
    );
    await page.getByRole("button", { name: "完整记录", exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector("#story-meta").textContent.startsWith("完整记录"),
    );
    await page
      .locator("#story-search")
      .fill("这个测试短语不应出现在剧本中-729143");
    await page.waitForFunction(
      () => document.querySelector("#entry-summary").textContent === "0 段记录",
    );
    await page.locator("#story-search").fill("");
    await page.locator(".entry-content").first().waitFor();
    await page
      .getByRole("button", { name: "设置", exact: false })
      .last()
      .click();
    await page.locator("#page-settings").waitFor({ state: "visible" });
    const weburl = `http://127.0.0.1:${server.address().port}`;
    await page.locator("#koishiUrl").fill(weburl);
    await page.locator("#save-settings").click();
    await page
      .locator("#notice-text")
      .filter({ hasText: "设置已保存" })
      .waitFor();
    await page.screenshot({ path: path.join(artifacts, "02-settings.png") });
    await page.locator('[data-route="webui"]').click();
    await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const end = Date.now() + 10000;
      while (Date.now() < end) {
        const view = window.contentView.children.find((view) =>
          view.webContents?.getURL().startsWith("http://127.0.0.1:"),
        );
        if (
          view &&
          (await view.webContents.executeJavaScript(
            'document.body?.textContent.includes("内嵌网页验证通过")',
          ))
        ) {
          const isolated = await view.webContents.executeJavaScript(
            'typeof window.launcher === "undefined" && typeof require === "undefined"',
          );
          if (!isolated) throw new Error("Remote view has native privileges");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Embedded WebUI did not render");
    });
    await page.screenshot({ path: path.join(artifacts, "03-webui.png") });
    await page.locator('[data-route="dashboard"]').click();
    await page.locator("#page-dashboard").waitFor({ state: "visible" });
    assert.equal(
      await app.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].contentView.children.filter(
            (view) =>
              view.webContents?.getURL().startsWith("http") &&
              view.getVisible(),
          ).length,
      ),
      0,
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(980, 690),
    );
    await page.waitForFunction(() => innerWidth < 1000);
    assert.ok(
      await page
        .locator(".dashboard-bottom")
        .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator("#start-all")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
      "0s",
    );
    await page.screenshot({ path: path.join(artifacts, "04-compact.png") });

    // Exercise real child processes through the renderer/IPC, using isolated fixtures.
    const fixtureDirs = {};
    for (const id of ["koishi", "snowluma"]) {
      const dir = path.join(artifacts, `fixture ${id}`);
      fs.mkdirSync(dir);
      fixtureDirs[id] = dir;
      fs.writeFileSync(
        path.join(dir, "run.cjs"),
        `console.log('${id} 中文日志已连接'); console.error('${id} 错误流已连接'); setInterval(()=>{},1000);`,
      );
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ scripts: { start: "node run.cjs" } }),
      );
      fs.writeFileSync(
        path.join(dir, "launcher.bat"),
        "@echo off\r\nnode run.cjs\r\npause\r\n",
      );
    }
    await page.evaluate(
      async ({ config, fixtureDirs }) =>
        window.launcher.saveConfig({
          ...config,
          koishiDir: fixtureDirs.koishi,
          snowlumaDir: fixtureDirs.snowluma,
          koishiUrl: "",
          snowlumaUrl: "",
        }),
      { config, fixtureDirs },
    );
    await page.reload();
    await page
      .locator("#path-koishi")
      .filter({ hasText: fixtureDirs.koishi })
      .waitFor();
    for (const id of ["koishi", "snowluma"]) {
      await page.locator(`[data-start="${id}"]`).click();
      await page
        .locator(`[data-status="${id}"][data-phase="running"]`)
        .waitFor();
      await page.locator(`[data-log-tab="${id}"]`).click();
      await page
        .locator(".log-content")
        .filter({ hasText: `${id} 中文日志已连接` })
        .waitFor();
    }
    await page.locator("#log-search").fill("错误流");
    await page.waitForFunction(
      () => document.querySelectorAll(".log-row").length === 1,
    );
    await app.evaluate(({ clipboard }) => {
      clipboard.writeText = (text) => {
        globalThis.interludeTestClipboard = text;
      };
    });
    await page.locator("#copy-logs").click();
    assert.ok(
      (await app.evaluate(() => globalThis.interludeTestClipboard)).includes(
        "snowluma 中文日志已连接",
      ),
    );
    await page.locator("#log-search").fill("");
    await page.locator("#stop-all").click();
    await page
      .locator('[data-status="koishi"][data-phase="stopped"]')
      .waitFor();
    await page
      .locator('[data-status="snowluma"][data-phase="stopped"]')
      .waitFor();
    await page.locator("#clear-logs").click();
    await page.locator("#log-empty").waitFor({ state: "visible" });
    await page.evaluate((config) => window.launcher.saveConfig(config), {
      ...config,
      koishiUrl: weburl,
    });
    await page.reload();
    await page.locator('[data-route="webui"]').click();
    await new Promise((resolve) => server.close(resolve));
    await page.locator("#web-reload").click();
    await page
      .locator("#web-state-title")
      .filter({ hasText: "暂时无法连接" })
      .waitFor();
    await page.locator('[data-route="dashboard"]').click();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: dashboard, real read-only DB, pagination, search, settings, embedded WebUI, privilege isolation, route hiding, compact layout, reduced motion.",
    );
    console.log("Artifacts:", artifacts);
  } finally {
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 });
      })
      .catch(() => {});
    await app.close();
    server.close();
  }
}
run().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
