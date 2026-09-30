const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "test-results", `about-${Date.now()}`);
fs.mkdirSync(artifacts, { recursive: true });
const { profile } = require("./demo.cjs").createDemo(artifacts);
const projects = require("../src/about.cjs");
fs.writeFileSync(
  path.join(profile, "repository-stars.json"),
  JSON.stringify(
    Object.fromEntries(
      projects.map((project, i) => [
        project.id,
        { count: [0, 43, 6237, 1366, 51, 123339][i], checkedAt: Date.now() },
      ]),
    ),
  ),
);
(async () => {
  const app = await electron.launch({
    args: [root],
    env: { ...process.env, INTERLUDE_TEST_PROFILE: profile },
  });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-route="settings"]').click();
    await page
      .locator('[data-project-stars="launcher"]')
      .filter({ hasText: "0" })
      .waitFor();
    assert.equal(await page.locator(".star-button").count(), projects.length);
    assert.equal(
      await page.locator('[data-project-stars="skills"]').count(),
      0,
    );
    const validate = async () => {
      const layout = await page.locator(".star-button").evaluateAll((buttons) =>
        buttons.map((button) => {
          const b = button.getBoundingClientRect(),
            c = button.querySelector(".star-count").getBoundingClientRect();
          return {
            width: b.width,
            left: b.left,
            divider: c.left,
            right: b.right,
          };
        }),
      );
      for (const row of layout) assert.deepEqual(row, layout[0]);
    };
    await validate();
    await app.evaluate(({ shell }) => {
      shell.openExternal = async (url) => {
        globalThis.openedProject = url;
      };
    });
    await page.locator('[data-project-stars="launcher"]').click();
    assert.equal(
      await app.evaluate(() => globalThis.openedProject),
      projects[0].url,
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(980, 690),
    );
    await page.waitForFunction(() => innerWidth < 1000);
    await validate();
    await page
      .locator(".about-card")
      .screenshot({ path: path.join(artifacts, "aligned-stars.png") });
    console.log(
      "PASS: Star zero and large counts, equal widths and divider alignment at both window sizes, project link.",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
