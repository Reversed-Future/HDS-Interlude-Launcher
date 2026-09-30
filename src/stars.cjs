const fs = require("node:fs");
const path = require("node:path");
const projects = require("./about.cjs");
class StarCounts {
  constructor(profile, fetcher) {
    this.file = path.join(profile, "repository-stars.json");
    this.fetcher = fetcher;
    this.pending = null;
  }
  async load() {
    if (this.pending) return this.pending;
    this.pending = this.fetch().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  async fetch() {
    let cache = {};
    try {
      cache = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      /* First run. */
    }
    const results = await Promise.all(
      projects.map(async (project) => {
        const previous = cache[project.id];
        if (
          previous &&
          Number.isSafeInteger(previous.count) &&
          Date.now() - previous.checkedAt < 3600000
        )
          return [project.id, previous];
        const github = project.url.startsWith("https://github.com/");
        const gitee = project.url.startsWith("https://gitee.com/");
        if (!github && !gitee)
          return [project.id, { count: null, checkedAt: 0 }];
        try {
          const api = github
            ? "https://api.github.com/repos/"
            : "https://gitee.com/api/v5/repos/";
          const response = await this.fetcher(
            api + new URL(project.url).pathname.slice(1),
            {
              headers: {
                "User-Agent": "HDS-Interlude-Launcher",
                Accept: "application/json",
              },
              signal: AbortSignal.timeout(15000),
            },
          );
          if (!response.ok) throw new Error("unavailable");
          const data = await response.json();
          if (
            !Number.isSafeInteger(data.stargazers_count) ||
            data.stargazers_count < 0
          )
            throw new Error("invalid count");
          return [
            project.id,
            { count: data.stargazers_count, checkedAt: Date.now() },
          ];
        } catch {
          return [
            project.id,
            previous && Number.isSafeInteger(previous.count)
              ? { ...previous, stale: true }
              : { count: null, checkedAt: 0 },
          ];
        }
      }),
    );
    const result = Object.fromEntries(results);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(result));
    return result;
  }
}
module.exports = { StarCounts };
