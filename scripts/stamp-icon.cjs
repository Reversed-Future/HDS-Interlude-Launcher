const path = require("node:path");
const pkg = require("../package.json");
(async () => {
  const { rcedit } = await import("rcedit");
  await rcedit(process.argv[2], {
    icon: path.resolve(__dirname, "../assets/icon.ico"),
    "file-version": pkg.version,
    "product-version": pkg.version,
    "version-string": {
      ProductName: pkg.productName,
      FileDescription: pkg.productName,
      CompanyName: "Reversed-Future",
      InternalName: "HDS-Interlude Launcher",
      OriginalFilename: "HDS-Interlude Launcher.exe",
    },
  });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
