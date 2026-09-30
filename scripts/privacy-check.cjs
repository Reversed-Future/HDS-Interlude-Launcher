// Scan staged files and the packaged application without printing matched values.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const relativeFiles = execFileSync("git", ["ls-files", "--cached", "-z"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const rules = [
  [
    "credential pattern",
    /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/g,
  ],
  [
    "personal home path",
    /[A-Z]:[\\/]+Users[\\/]+(?!Public\b|Default\b|<)[A-Za-z0-9._-]+/g,
  ],
  [
    "personal email",
    /[A-Za-z0-9._%+-]+@(?:qq\.com|163\.com|126\.com|outlook\.com|gmail\.com)/g,
  ],
];
const privateValues = [process.env.USERPROFILE, root].filter(Boolean);
const seed = path.join(root, "local-settings.json");
if (fs.existsSync(seed)) {
  const local = JSON.parse(fs.readFileSync(seed, "utf8"));
  for (const key of ["koishiDir", "snowlumaDir", "qqExe", "databasePath"])
    if (local[key]) privateValues.push(local[key]);
  const yaml = path.join(local.koishiDir, "koishi.yml");
  if (fs.existsSync(yaml)) {
    const source = require("yaml").parse(fs.readFileSync(yaml, "utf8"));
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      for (const [key, item] of Object.entries(value)) {
        if (
          ["apiKey", "token", "selfId", "userId", "qq"].includes(key) &&
          ["string", "number"].includes(typeof item) &&
          String(item).length >= 6
        )
          privateValues.push(String(item));
        else visit(item);
      }
    };
    visit(source);
  }
}
const findings = [];
function scan(file, label, firstParty = true) {
  if (!fs.statSync(file).isFile()) return;
  const bytes = fs.readFileSync(file);
  if (/\.(png|exe|dll|bin|pak|dat|ico|node)$/i.test(file)) return;
  const text = bytes.toString("utf8");
  for (const value of new Set(privateValues)) {
    if (text.includes(value) || text.includes(value.replaceAll("\\", "\\\\")))
      findings.push({
        file: label,
        issue: "local private value",
        line: text.slice(0, text.indexOf(value)).split("\n").length,
      });
  }
  if (firstParty)
    for (const [issue, regex] of rules) {
      regex.lastIndex = 0;
      for (const match of text.matchAll(regex))
        findings.push({
          file: label,
          issue,
          line: text.slice(0, match.index).split("\n").length,
        });
    }
}
for (const file of relativeFiles) {
  if (
    /(?:^|\/)(?:local-settings\.json|settings\.json|koishi\.yml|\.env(?:\..*)?)$|\.(?:db|tgz|lnk|bak)$|^(?:test-results|reference|release)\//.test(
      file,
    )
  )
    findings.push({ file, issue: "private or generated file staged" });
  scan(path.join(root, file), file);
}
let packagedFiles = 0;
if (process.argv.includes("--package")) {
  const build = JSON.parse(
    fs.readFileSync(path.join(root, "release/latest.json"), "utf8"),
  );
  const visit = (dir, relative = "") => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = path.join(relative, entry.name),
        file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file, name);
      else {
        packagedFiles++;
        if (
          ["local-settings.json", "settings.json", "koishi.yml"].includes(
            entry.name,
          ) ||
          /\.(db|tgz|lnk|bak)$/.test(entry.name)
        )
          findings.push({
            file: "package/" + name,
            issue: "private or generated file packaged",
          });
        scan(
          file,
          "package/" + name,
          name.startsWith(path.join("resources", "app")) &&
            !name.includes("node_modules"),
        );
      }
    }
  };
  visit(build.directory);
}
console.log(
  JSON.stringify(
    { stagedFiles: relativeFiles.length, packagedFiles, findings },
    null,
    2,
  ),
);
if (findings.length) process.exitCode = 1;
