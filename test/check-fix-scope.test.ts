import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildReport, listProjectPaths, type CheckConfig } from "../src/check/check";
import { fixMissingFolders } from "../src/check/fix";
import { changedPaths, limitToPaths } from "../src/check/scope";
import { formatText } from "../src/check/format";
import { runCli } from "./helpers/run-cli";

let work: string;

beforeEach(() => {
  work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-fix-")));
});
afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

const write = (rel: string, content = "") => {
  fs.mkdirSync(path.dirname(path.join(work, rel)), { recursive: true });
  fs.writeFileSync(path.join(work, rel), content);
};
const exists = (rel: string) => fs.existsSync(path.join(work, rel));
const git = (args: string[], cwd = work) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });

describe("--fix", () => {
  const config: CheckConfig = {
    layout: {
      tests: { purpose: "Tests", required: true },
      "src/api": { purpose: "API", required: true },
      docs: { purpose: "Docs", required: true },
      misc: { purpose: "Not required" },
    },
    rules: [{ id: "no-js", forbid: "*.js", severity: "error" }],
  };

  it("creates only the missing required folders, each with a .gitkeep", () => {
    write("docs/readme.md", "keep me");
    const created = fixMissingFolders(work, config, listProjectPaths(work));
    expect(created).toEqual(["tests/", "src/api/"]);
    expect(exists("tests/.gitkeep") && exists("src/api/.gitkeep")).toBe(true);
    expect(exists("misc")).toBe(false);
    expect(fs.readdirSync(path.join(work, "docs"))).toEqual(["readme.md"]);
  });

  it("never moves, renames or deletes anything", () => {
    write("scripts.js", "x");
    fixMissingFolders(work, config, listProjectPaths(work));
    expect(fs.readFileSync(path.join(work, "scripts.js"), "utf8")).toBe("x");
  });

  it("refuses when a file is in the way", () => {
    write("tests", "i am a file");
    expect(() => fixMissingFolders(work, config, listProjectPaths(work))).toThrow(/a file with that name already exists/);
    expect(fs.readFileSync(path.join(work, "tests"), "utf8")).toBe("i am a file");
  });

  it("doesn't claim to create a folder that exists but is ignored", () => {
    write("build/x.txt");
    const c: CheckConfig = { layout: { build: { purpose: "x", required: true } }, rules: [] };
    expect(fixMissingFolders(work, c, listProjectPaths(work))).toEqual([]);
  });

  it("re-checking after the fix clears the errors, and the report says what was created", () => {
    fixMissingFolders(work, config, listProjectPaths(work));
    const report = buildReport(config, listProjectPaths(work), { name: "t" }, { fixed: ["tests/", "src/api/", "docs/"] });
    expect(report.counts.error).toBe(0);
    expect(formatText(report, "t")).toMatch(/Created 3 missing required folder\(s\), each with a \.gitkeep:\n {2}tests\//);
  });
});

describe("limitToPaths", () => {
  const findings = [
    { severity: "error" as const, path: "tests/", message: "missing", rule: "required" },
    { severity: "info" as const, path: "tests/", message: "todo", rule: "todo" },
    { severity: "info" as const, path: "helpers/", message: "unknown", rule: "unknown-folder" },
    { severity: "warn" as const, path: "src/Bad.ts", message: "naming", rule: "naming" },
    { severity: "warn" as const, path: "src/Old.ts", message: "naming", rule: "naming" },
  ];

  it("keeps findings about changed files and folders that contain them", () => {
    expect(limitToPaths(findings, ["src/Bad.ts", "helpers/x.ts"]).map((f) => f.path)).toEqual(["helpers/", "src/Bad.ts"]);
  });

  it("drops project-wide findings", () => {
    expect(limitToPaths(findings, ["tests/a.ts"])).toEqual([]);
  });
});

describe("changedPaths", () => {
  beforeEach(() => {
    git(["init", "-q"]);
    write("a.ts", "1");
    write("gone.ts", "1");
    write("app/x.ts", "1");
    git(["add", "."]);
    git(["commit", "-q", "-m", "init"]);
  });

  it("staged: only what git commit would commit", () => {
    write("a.ts", "2"); // unstaged
    write("b.ts"); // staged
    git(["add", "b.ts"]);
    write("c.ts"); // untracked
    fs.rmSync(path.join(work, "gone.ts")); // deleted: nothing to check
    git(["add", "gone.ts"]);
    expect(changedPaths(work, "staged")).toEqual(["b.ts"]);
  });

  it("changed: staged, unstaged and untracked", () => {
    write("a.ts", "2");
    write("b.ts");
    git(["add", "b.ts"]);
    write("c.ts");
    expect(changedPaths(work, "changed")).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("is relative to a project inside a bigger repository", () => {
    write("app/y.ts");
    write("outside.ts");
    git(["add", "."]);
    expect(changedPaths(path.join(work, "app"), "staged")).toEqual(["y.ts"]);
  });

  it("respects .gitignore for untracked files", () => {
    write(".gitignore", "*.log\n");
    write("debug.log");
    expect(changedPaths(work, "changed")).toEqual([".gitignore"]);
  });
});

it("changedPaths needs a repository", () => {
  expect(() => changedPaths(work, "staged")).toThrow(/needs a Git repository/);
});

describe("skelpro check --fix / --staged (CLI)", { timeout: 90_000 }, () => {
  beforeEach(() => {
    write(
      ".skelpro.json",
      JSON.stringify({
        skelpro: 1,
        template: { name: "app" },
        layout: { src: { purpose: "Source", naming: "kebab-case" }, tests: { purpose: "Tests", required: true } },
        rules: [],
      }),
    );
    write("src/old-file.ts");
  });

  it("--fix creates the folder and exits 0", async () => {
    const before = await runCli(work, ["check"]);
    expect(before.status).toBe(1);

    const r = await runCli(work, ["check", "--fix"]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Created 1 missing required folder\(s\)/);
    expect(exists("tests/.gitkeep")).toBe(true);
  });

  it("--staged only reports problems in staged files", async () => {
    git(["init", "-q"]);
    write("src/OldName.ts");
    git(["add", "."]);
    git(["commit", "-q", "-m", "init"]);
    write("src/NewName.ts");
    git(["add", "src/NewName.ts"]);

    const r = await runCli(work, ["check", "--staged", "--json"]);
    const report = JSON.parse(r.stdout);
    // The missing tests/ folder and the old OldName.ts aren't about this commit.
    expect(report.findings.map((f: { path: string }) => f.path)).toEqual(["src/NewName.ts"]);
    expect(report.scope).toEqual({ kind: "staged", files: ["src/NewName.ts"] });
    expect(r.status).toBe(0); // a naming warning doesn't fail without --strict
  });

  it("refuses --staged with --changed, and --staged outside a repo (exit 2)", async () => {
    const both = await runCli(work, ["check", "--staged", "--changed"]);
    expect(both.status).toBe(2);
    expect(both.stderr).toMatch(/either --staged or --changed/);

    const noRepo = await runCli(work, ["check", "--staged"]);
    expect(noRepo.status).toBe(2);
    expect(noRepo.stderr).toMatch(/needs a Git repository/);
  });
});
