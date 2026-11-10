import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildReport,
  companionFor,
  companionMapping,
  exitCodeFor,
  listProjectPaths,
  runChecks,
  type CheckConfig,
  type ProjectPaths,
} from "../src/check/check";
import { loadCheckConfig } from "../src/check/config";
import { formatGithub, formatText } from "../src/check/format";
import { runCli } from "./helpers/run-cli";

/** Builds a path list from file paths; folders are inferred. */
function project(...files: string[]): ProjectPaths {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  return { files: [...files].sort(), dirs: [...dirs].sort() };
}

const cfg = (c: Partial<CheckConfig>): CheckConfig => ({ layout: {}, rules: [], ...c });
const ids = (config: CheckConfig, p: ProjectPaths) => runChecks(config, p).map((f) => `${f.rule}:${f.path}`);

describe("required folders", () => {
  const config = cfg({ layout: { tests: { purpose: "Tests", required: true } } });

  it("passes when the folder exists", () => {
    expect(ids(config, project("tests/a.test.ts"))).toEqual([]);
  });

  it("is an error when it's missing", () => {
    expect(runChecks(config, project("src/a.ts"))).toContainEqual({
      severity: "error",
      path: "tests/",
      message: "required folder is missing",
      rule: "required",
    });
  });
});

describe("forbidden files", () => {
  const config = cfg({ rules: [{ id: "no-root-scripts", forbid: "*.js", except: ["*.config.js"], severity: "error" }] });

  it("passes for allowed files", () => {
    expect(ids(config, project("vite.config.js", "src/app.js"))).toEqual([]);
  });

  it("flags matching files, honouring except", () => {
    const f = runChecks(config, project("scripts.js", "vite.config.js"));
    expect(f).toEqual([
      { severity: "error", path: "scripts.js", message: "not allowed in project root", rule: "no-root-scripts" },
    ]);
  });

  it("matches dotfiles and nested globs", () => {
    const c = cfg({ rules: [{ id: "no-env", forbid: "**/.env.production", severity: "error" }] });
    expect(ids(c, project("apps/web/.env.production"))).toEqual(["no-env:apps/web/.env.production"]);
  });
});

describe("naming", () => {
  const config = cfg({ layout: { "src/routes": { purpose: "Routes", naming: "kebab-case" } } });

  it("passes for correctly named files", () => {
    expect(ids(config, project("src/routes/user-routes.ts", "src/routes/index.ts", "src/routes/a.test.ts"))).toEqual([]);
  });

  it("warns, suggests the name and a git mv", () => {
    expect(runChecks(config, project("src/routes/UserRoutes.test.ts"))).toEqual([
      {
        severity: "warn",
        path: "src/routes/UserRoutes.test.ts",
        message: "use kebab-case: user-routes.test.ts",
        rule: "naming",
        suggestion: 'git mv "src/routes/UserRoutes.test.ts" "src/routes/user-routes.test.ts"',
      },
    ]);
  });

  it("only checks files directly inside the folder", () => {
    expect(ids(config, project("src/routes/v1/UserRoutes.ts", "src/Other.ts"))).toEqual([]);
  });

  it.each([
    ["camelCase", "userRoutes.ts", "UserRoutes.ts", "userRoutes.ts"],
    ["PascalCase", "UserCard.tsx", "user-card.tsx", "UserCard.tsx"],
    ["snake_case", "user_routes.py", "UserRoutes.py", "user_routes.py"],
    ["UPPER_CASE", "README.md", "readMe.md", "READ_ME.md"],
  ] as const)("%s: %s passes, %s is renamed to %s", (style, good, bad, fixed) => {
    const c = cfg({ layout: { d: { purpose: "x", naming: style } } });
    expect(ids(c, project(`d/${good}`))).toEqual([]);
    expect(runChecks(c, project(`d/${bad}`))[0].message).toBe(`use ${style}: ${fixed}`);
  });
});

describe("expected companions", () => {
  const colocated = { id: "colocated-unit-tests", match: "src/**/*.ts", expect: "src/**/*.test.ts", severity: "warn" as const };

  it("maps a file to its companion", () => {
    expect(companionFor("src/services/billing.ts", companionMapping(colocated))).toBe("src/services/billing.test.ts");
    const mirrored = companionMapping({ id: "m", match: "src/**/*.ts", expect: "tests/**/*.spec.ts" });
    expect(companionFor("src/services/billing.ts", mirrored)).toBe("tests/services/billing.spec.ts");
  });

  it("passes when every file has its companion, and doesn't demand tests for tests", () => {
    const c = cfg({ rules: [colocated] });
    expect(ids(c, project("src/services/billing.ts", "src/services/billing.test.ts"))).toEqual([]);
  });

  it("warns about a missing companion", () => {
    expect(runChecks(cfg({ rules: [colocated] }), project("src/services/billing.ts"))).toEqual([
      { severity: "warn", path: "src/services/billing.ts", message: "has no billing.test.ts", rule: "colocated-unit-tests" },
    ]);
  });

  it("shows the full path when the companion lives elsewhere", () => {
    const c = cfg({ rules: [{ id: "m", match: "src/**/*.ts", expect: "tests/**/*.test.ts", severity: "warn" }] });
    expect(runChecks(c, project("src/a/b.ts"))[0].message).toBe("has no tests/a/b.test.ts");
  });

  it("refuses globs it can't map", () => {
    expect(() => companionMapping({ id: "x", match: "src/**/*.{ts,js}", expect: "src/**/*.test.ts" })).toThrow(
      /exactly one \*/,
    );
  });
});

describe("unknown folders and TODOs", () => {
  const config = cfg({
    layout: { "src/lib": { purpose: "Shared helpers" }, tests: { purpose: "TODO: describe what belongs here" } },
  });

  it("notes top-level folders that aren't in the layout, with a guess", () => {
    const f = runChecks(config, project("src/lib/a.ts", "tests/a.ts", "helpers/x.ts", "misc/y.ts", ".github/ci.yml"));
    expect(f.filter((x) => x.rule === "unknown-folder")).toEqual([
      { severity: "info", path: "helpers/", message: "isn't in the layout; did you mean src/lib/?", rule: "unknown-folder" },
      { severity: "info", path: "misc/", message: "isn't in the layout", rule: "unknown-folder" },
    ]);
  });

  it("notes purposes still left as TODO", () => {
    expect(ids(config, project("src/lib/a.ts", "tests/a.ts"))).toEqual(["todo:tests/"]);
  });

  it("says nothing about folders when there's no layout", () => {
    expect(ids(cfg({}), project("anything/x.ts"))).toEqual([]);
  });
});

describe("ignores from .skelpro.json", () => {
  it("switches a rule off for matching paths only", () => {
    const config = cfg({
      layout: { src: { purpose: "x", naming: "kebab-case" } },
      ignore: { naming: ["src/LegacyThing.ts"] },
    });
    expect(ids(config, project("src/LegacyThing.ts", "src/NewThing.ts"))).toEqual(["naming:src/NewThing.ts"]);
  });

  it("'*' switches every rule off for a path", () => {
    const config = cfg({ layout: { tests: { purpose: "x", required: true } }, ignore: { "*": ["tests"] } });
    expect(ids(config, project("a.ts"))).toEqual([]);
  });
});

describe("report, exit codes and formats", () => {
  const config = cfg({
    layout: { tests: { purpose: "Tests", required: true }, "src/routes": { purpose: "R", naming: "kebab-case" } },
    rules: [{ id: "no-root-scripts", forbid: "*.js", severity: "error" }],
  });
  const report = buildReport(config, project("scripts.js", "src/routes/UserRoutes.ts"), { name: "node-api", version: "2" });

  it("counts by severity and sorts errors first", () => {
    expect(report.counts).toEqual({ error: 2, warn: 1, info: 0 });
    expect(report.findings.map((f) => f.severity)).toEqual(["error", "error", "warn"]);
  });

  it("exit code: errors fail; warnings only with --strict", () => {
    expect(exitCodeFor(report)).toBe(1);
    const warnOnly = buildReport(cfg({ layout: { d: { purpose: "x", naming: "kebab-case" } } }), project("d/Bad.ts"));
    expect(exitCodeFor(warnOnly)).toBe(0);
    expect(exitCodeFor(warnOnly, true)).toBe(1);
  });

  it("text output matches the roadmap's shape", () => {
    const text = formatText(report, "x");
    expect(text.split("\n")[0]).toBe("skelpro check: node-api v2 -- 2 errors, 1 warning");
    expect(text).toMatch(/ {2}error {2}scripts\.js +not allowed in project root +\[no-root-scripts\]/);
    expect(text).toMatch(/ {2}error {2}tests\/ +required folder is missing +\[required\]/);
    expect(text).toMatch(/ {2}warn {3}src\/routes\/UserRoutes\.ts +use kebab-case: user-routes\.ts +\[naming\]/);
    expect(text).toMatch(/Suggested fixes \(not run\):\n {2}git mv "src\/routes\/UserRoutes\.ts" "src\/routes\/user-routes\.ts"/);
  });

  it("clean text output", () => {
    expect(formatText(buildReport(cfg({}), project("a.ts", "b.ts")), "my-api")).toBe(
      "skelpro check: my-api -- no problems found in 2 files\n",
    );
  });

  it("GitHub annotations, with values escaped", () => {
    const lines = formatGithub(report, "x").trim().split("\n");
    expect(lines).toContain("::error file=tests,title=skelpro check (required)::required folder is missing");
    // ":" is only escaped in properties (file=, title=), not in the message.
    expect(lines).toContain(
      '::warning file=src/routes/UserRoutes.ts,title=skelpro check (naming)::use kebab-case: user-routes.ts. ' +
        'Suggested: git mv "src/routes/UserRoutes.ts" "src/routes/user-routes.ts"',
    );
    const odd = buildReport(cfg({ rules: [{ id: "x", forbid: "*", severity: "info" }] }), project("a,b:c%.txt"));
    expect(formatGithub(odd, "x")).toContain("::notice file=a%2Cb%3Ac%25.txt,");
  });
});

describe("on disk", () => {
  let root: string;
  beforeEach(() => {
    root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-check-")), "app");
    fs.mkdirSync(root);
  });
  afterEach(() => {
    fs.rmSync(path.dirname(root), { recursive: true, force: true });
  });

  const write = (rel: string, content = "") => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  const manifest = (m: object) => write(".skelpro.json", JSON.stringify({ skelpro: 1, template: { name: "node-api" }, ...m }));

  it("walks the project with save's ignore rules", () => {
    write("src/a.ts");
    write("node_modules/x/index.js");
    write("dist/out.js");
    write(".env");
    write(".gitignore", "generated/\n");
    write("generated/y.ts");
    expect(listProjectPaths(root)).toEqual({ files: [".gitignore", "src/a.ts"], dirs: ["src"] });
  });

  it("loads layout, rules and ignores from .skelpro.json", async () => {
    manifest({ layout: { tests: { purpose: "T", required: true } }, rules: [{ id: "no-js", forbid: "*.js" }], ignore: { "no-js": ["ok.js"] } });
    const { config, template } = await loadCheckConfig(root);
    expect(template).toEqual({ name: "node-api" });
    expect(config.rules).toEqual([{ id: "no-js", forbid: "*.js", severity: "error" }]);
    expect(config.ignore).toEqual({ "no-js": ["ok.js"] });
  });

  it.each([
    [null, /No \.skelpro\.json/],
    ["{ not json", /not valid JSON/],
    [JSON.stringify({ hello: 1 }), /not a SkelPro manifest/],
    [JSON.stringify({ skelpro: 1, layout: { src: {} } }), /needs a "purpose"/],
    [JSON.stringify({ skelpro: 1, ignore: { naming: "src/**" } }), /"ignore" must map/],
  ])("refuses a bad config (%s)", async (content, message) => {
    if (content !== null) write(".skelpro.json", content);
    await expect(loadCheckConfig(root)).rejects.toThrow(message);
  });

  it("--template: renders the template's layout with the manifest's values", async () => {
    write(
      "../tpl.json",
      JSON.stringify({
        skelpro: 2,
        name: "svc",
        variables: { feature: { type: "string" } },
        files: {},
        layout: { "src/{{feature}}": { purpose: "x", required: true } },
      }),
    );
    manifest({ variables: { feature: "billing" } });
    const { config } = await loadCheckConfig(root, { template: path.join(root, "..", "tpl.json") });
    expect(Object.keys(config.layout)).toEqual(["src/billing"]);

    const viaVar = await loadCheckConfig(root, { template: path.join(root, "..", "tpl.json"), vars: { feature: "orders" } });
    expect(Object.keys(viaVar.config.layout)).toEqual(["src/orders"]);
  });
});

describe("skelpro check (CLI)", { timeout: 90_000 }, () => {
  let root: string;
  beforeEach(() => {
    root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-checkcli-")), "app");
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".skelpro.json"),
      JSON.stringify({
        skelpro: 1,
        template: { name: "node-api", version: "2" },
        layout: { src: { purpose: "Source", naming: "kebab-case" }, tests: { purpose: "Tests", required: true } },
        rules: [{ id: "no-root-scripts", forbid: "*.js", except: ["*.config.js"] }],
      }),
    );
  });
  afterEach(() => {
    fs.rmSync(path.dirname(root), { recursive: true, force: true });
  });

  it("exits 1 with errors, and prints the report", async () => {
    fs.writeFileSync(path.join(root, "scripts.js"), "");
    const r = await runCli(root, ["check"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^skelpro check: node-api v2 -- 2 errors, 0 warnings/);
  });

  it("exits 0 when clean; warnings fail only with --strict", async () => {
    fs.mkdirSync(path.join(root, "tests"));
    fs.writeFileSync(path.join(root, "src", "BadName.ts"), "");
    const r = await runCli(root, ["check"]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/0 errors, 1 warning/);
    const strict = await runCli(root, ["check", "--strict"]);
    expect(strict.status).toBe(1);
  });

  it("--json prints only the report", async () => {
    const r = await runCli(root, ["check", "--json"]);
    expect(r.status).toBe(1);
    const report = JSON.parse(r.stdout);
    expect(report.counts.error).toBe(1);
    expect(report.findings[0]).toMatchObject({ rule: "required", path: "tests/" });
  });

  it("--format github prints annotations", async () => {
    const r = await runCli(path.dirname(root), ["check", "app", "--format", "github"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^::error file=tests,title=skelpro check \(required\)::required folder is missing$/m);
  });

  it("exits 2 when SkelPro can't run the check", async () => {
    fs.rmSync(path.join(root, ".skelpro.json"));
    const r = await runCli(root, ["check"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/No \.skelpro\.json/);

    const bad = await runCli(root, ["check", "--format", "xml"]);
    expect(bad.status).toBe(2);
  });
});
