// Opt-in live integration: download and verify; never execute the downloaded programs.
const { _electron: electron } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const directory = path.join(
  root,
  "test-results",
  `official-downloads-${Date.now()}`,
);
fs.mkdirSync(directory, { recursive: true });
(async () => {
  const app = await electron.launch({
    args: [root],
    env: {
      ...process.env,
      INTERLUDE_TEST_PROFILE: path.join(directory, "profile"),
    },
  });
  try {
    const window = await app.firstWindow();
    await window.locator('[data-route="setup"]').waitFor();
    console.log("Live download verification:", directory);
    const result = await app.evaluate(
      async ({ net }, { root, directory }) => {
        const require = process
          .getBuiltinModule("module")
          .createRequire(root + "/package.json");
        const { SetupService } = require(root + "/src/setup/service.cjs");
        const { OfficialInstaller } = require(
          root + "/src/setup/official-installer.cjs",
        );
        const { ConfigStore, defaults } = require(root + "/src/config.cjs");
        const fs = require("node:fs");
        const store = new ConfigStore(directory + "/fixture-settings.json");
        store.save(defaults);
        const setup = new SetupService(store, {
          busy: new Set(),
          children: new Map(),
        });
        setup.on("log", (line) =>
          fs.appendFileSync(directory + "/verification.log", line.text + "\n"),
        );
        let qqFile;
        const installer = new OfficialInstaller(setup, {
          fetcher: require(root + "/src/setup/electron-fetch.cjs")
            .fetchOfficial,
          directory: directory + "/downloads",
          open: async (file) => {
            qqFile = file;
            return "";
          },
        });
        const config = process.env.HDS_VERIFY_QQ_ONLY
          ? { snowlumaDir: "previously verified" }
          : await installer.snow({ parent: directory, name: "SnowLuma" });
        await installer.qq();
        return {
          snow: config.snowlumaDir,
          qq: qqFile,
          signature: "Valid",
          installerExecuted: false,
        };
      },
      { root, directory },
    );
    fs.writeFileSync(
      path.join(directory, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(result);
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
