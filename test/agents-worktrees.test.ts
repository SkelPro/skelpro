import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  agentStatuses,
  cleanupAgents,
  loadAgentsConfig,
  numberedNames,
  openRepo,
  readRecords,
  spawnAgents,
} from "../src/agents/agents";
import { runCli } from "./helpers/run-cli";

const execFileP = promisify(execFile);

let work: string;
let repoDir: string;
let agentsRoot: string;

// Async on purpose: Git is slow on some machines, and synchronous calls in a
// row block the Vitest worker long enough to miss its heartbeat
// ("Timeout calling onTaskUpdate").
const git = async (args: string[], cwd = repoDir) =>
  (await execFileP("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" })).stdout.trim();
const write = (dir: string, rel: string, content = "x") => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), content);
};
const branches = async () => (await git(["branch", "--format=%(refname:short)"])).split("\n").sort();

beforeEach(async () => {
  work = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-agents-")));
  repoDir = path.join(work, "shop");
  agentsRoot = path.join(work, "shop.agents");
  fs.mkdirSync(repoDir);
  await git(["init", "-q", "-b", "main"]);
  write(repoDir, "README.md", "# shop\n");
  write(repoDir, ".gitignore", ".env.local\n");
  await git(["add", "."]);
  await git(["commit", "-q", "-m", "init"]);
});

afterEach(async () => {
  try {
    await git(["worktree", "prune"]);
  } catch {
    // repo may be gone
  }
  fs.rmSync(work, { recursive: true, force: true });
});

describe("spawn", { timeout: 60_000 }, () => {
  it("creates a sibling worktree on agent/<name> from the current branch, and records it in .git", async () => {
    const repo = openRepo(repoDir);
    const [rec] = spawnAgents(repo, { names: ["invoices-api"] });

    expect(rec).toMatchObject({ name: "invoices-api", branch: "agent/invoices-api", base: "main" });
    expect(path.relative(work, rec.path)).toBe(path.join("shop.agents", "invoices-api"));
    expect(fs.readFileSync(path.join(rec.path, "README.md"), "utf8").replace(/\r\n/g, "\n")).toBe("# shop\n");
    expect(await git(["branch", "--show-current"], rec.path)).toBe("agent/invoices-api");
    expect(fs.existsSync(path.join(repoDir, ".git", "skelpro-agents.json"))).toBe(true);
    expect(await git(["status", "--porcelain"])).toBe(""); // nothing appears inside the repo
  });

  it("--from another ref", async () => {
    await git(["checkout", "-q", "-b", "develop"]);
    write(repoDir, "dev.txt");
    await git(["add", "."]);
    await git(["commit", "-q", "-m", "dev"]);
    await git(["checkout", "-q", "main"]);

    const [rec] = spawnAgents(openRepo(repoDir), { names: ["a"], from: "develop" });
    expect(rec.base).toBe("develop");
    expect(fs.existsSync(path.join(rec.path, "dev.txt"))).toBe(true);
  });

  it("numbered names for parallel attempts skip ones in use", async () => {
    const repo = openRepo(repoDir);
    spawnAgents(repo, { names: ["try-1"] });
    expect(numberedNames(repo, "try", 3)).toEqual(["try-2", "try-3", "try-4"]);
  });

  it("copies opted-in untracked files such as .env.local", async () => {
    write(repoDir, ".env.local", "TOKEN=1");
    write(repoDir, ".skelpro/config.json", JSON.stringify({ agents: { copy: [".env.local", "missing.txt"] } }));
    const repo = openRepo(repoDir);
    const [rec] = spawnAgents(repo, { names: ["a"], config: loadAgentsConfig(repo, path.join(work, "home")) });
    expect(fs.readFileSync(path.join(rec.path, ".env.local"), "utf8")).toBe("TOKEN=1");
  });

  it("uses a configured folder", async () => {
    const repo = openRepo(repoDir);
    const [rec] = spawnAgents(repo, { names: ["a"], config: { dir: "../elsewhere" } });
    expect(rec.path).toBe(path.join(work, "elsewhere", "a"));
  });

  it.each([
    [["Bad Name"], /Invalid agent name/],
    [["a", "a"], /listed twice/],
    [["-x"], /Invalid agent name/],
  ])("refuses %j and creates nothing", (names, message) => {
    expect(() => spawnAgents(openRepo(repoDir), { names })).toThrow(message);
    expect(fs.existsSync(agentsRoot)).toBe(false);
  });

  it("validates every name before creating any", async () => {
    await git(["branch", "agent/taken"]);
    expect(() => spawnAgents(openRepo(repoDir), { names: ["fine", "taken"] })).toThrow(/agent\/taken already exists/);
    expect(fs.existsSync(path.join(agentsRoot, "fine"))).toBe(false);
  });

  it("refuses an unknown --from", async () => {
    expect(() => spawnAgents(openRepo(repoDir), { names: ["a"], from: "nope" })).toThrow(/isn't a branch, tag or commit/);
  });
});

describe("list", { timeout: 60_000 }, () => {
  it("reports ahead, uncommitted changes and merged", async () => {
    const repo = openRepo(repoDir);
    const [a, b] = spawnAgents(repo, { names: ["a", "b"] });
    write(a.path, "work.txt");
    await git(["add", "."], a.path);
    await git(["commit", "-q", "-m", "work"], a.path);
    write(b.path, "draft.txt");
    write(b.path, "README.md", "changed");

    const byName = Object.fromEntries(agentStatuses(repo).map((s) => [s.name, s]));
    expect(byName.a).toMatchObject({ state: "ok", ahead: 1, behind: 0, changes: 0, merged: false });
    expect(byName.b).toMatchObject({ state: "ok", ahead: 0, changes: 2, merged: true });
  });

  it("only lists worktrees SkelPro created", async () => {
    await git(["worktree", "add", "-q", path.join(work, "manual"), "-b", "manual"]);
    spawnAgents(openRepo(repoDir), { names: ["a"] });
    expect(agentStatuses(openRepo(repoDir)).map((s) => s.name)).toEqual(["a"]);
  });
});

describe("cleanup", { timeout: 60_000 }, () => {
  it("removes a clean, merged worktree and its branch", async () => {
    const repo = openRepo(repoDir);
    const [a] = spawnAgents(repo, { names: ["a"] });
    expect(cleanupAgents(repo, { names: ["a"] })).toEqual({ removed: ["a"], refused: [] });
    expect(fs.existsSync(a.path)).toBe(false);
    expect((await branches())).toEqual(["main"]);
    expect(readRecords(repo)).toEqual([]);
  });

  it("refuses uncommitted changes, saying what would be lost; --force discards them", async () => {
    const repo = openRepo(repoDir);
    const [a] = spawnAgents(repo, { names: ["a"] });
    write(a.path, "wip.txt");

    const kept = cleanupAgents(repo, { names: ["a"] });
    expect(kept.removed).toEqual([]);
    expect(kept.refused[0].reason).toMatch(/1 uncommitted file\(s\).*would be lost.*--force/);
    expect(fs.existsSync(path.join(a.path, "wip.txt"))).toBe(true);

    expect(cleanupAgents(repo, { names: ["a"], force: true }).removed).toEqual(["a"]);
    expect(fs.existsSync(a.path)).toBe(false);
  });

  it("refuses an unmerged branch, saying how many commits would be lost; --force deletes it", async () => {
    const repo = openRepo(repoDir);
    const [a] = spawnAgents(repo, { names: ["a"] });
    write(a.path, "work.txt");
    await git(["add", "."], a.path);
    await git(["commit", "-q", "-m", "work"], a.path);

    const kept = cleanupAgents(repo, { names: ["a"] });
    expect(kept.refused[0].reason).toMatch(/agent\/a has 1 commit\(s\) not in main/);
    expect((await branches())).toContain("agent/a");

    cleanupAgents(repo, { names: ["a"], force: true });
    expect((await branches())).toEqual(["main"]);
  });

  it("--merged removes only merged, clean worktrees", async () => {
    const repo = openRepo(repoDir);
    const [done, busy, dirty] = spawnAgents(repo, { names: ["done", "busy", "dirty"] });
    write(busy.path, "w.txt");
    await git(["add", "."], busy.path);
    await git(["commit", "-q", "-m", "w"], busy.path);
    write(dirty.path, "wip.txt");

    const result = cleanupAgents(repo, { merged: true });
    expect(result.removed).toEqual(["done"]);
    expect(result.refused.map((r) => r.name)).toEqual(["dirty"]);
    expect(fs.existsSync(done.path)).toBe(false);
    expect(fs.existsSync(busy.path) && fs.existsSync(dirty.path)).toBe(true);
  });

  it("never deletes a folder Git doesn't list as a worktree", async () => {
    const repo = openRepo(repoDir);
    const [a] = spawnAgents(repo, { names: ["a"] });
    // Git lets go of the worktree, but the folder (with someone's files) is still there.
    fs.rmSync(path.join(repoDir, ".git", "worktrees", "a"), { recursive: true, force: true });
    write(a.path, "precious.txt");

    const result = cleanupAgents(repo, { names: ["a"], force: true });
    expect(result.refused[0].reason).toMatch(/no longer lists it as a worktree, so SkelPro won't delete it/);
    expect(fs.existsSync(path.join(a.path, "precious.txt"))).toBe(true);
  });

  it("doesn't touch worktrees SkelPro didn't create", async () => {
    const manual = path.join(work, "manual");
    await git(["worktree", "add", "-q", manual, "-b", "manual"]);
    expect(() => cleanupAgents(openRepo(repoDir), { names: ["manual"] })).toThrow(/No agent worktree named manual/);
    expect(fs.existsSync(manual)).toBe(true);
  });
});

describe("skelpro agents (CLI)", { timeout: 120_000 }, () => {
  it("spawn, list and cleanup", async () => {
    const spawned = await runCli(repoDir, ["agents", "spawn", "invoices-api", "auth-refactor", "--from", "main"]);
    expect(spawned.status, spawned.stderr).toBe(0);
    expect(spawned.stdout).toMatch(/Created invoices-api: branch agent\/invoices-api from main/);

    write(path.join(agentsRoot, "auth-refactor"), "a.ts");
    const listed = await runCli(repoDir, ["agents", "list"]);
    expect(listed.stdout).toMatch(/^NAME +BRANCH +BASE +AHEAD +CHANGES +PATH$/m);
    expect(listed.stdout).toMatch(/^auth-refactor +agent\/auth-refactor +main +0 +1 file +/m);
    expect(listed.stdout).toMatch(/^invoices-api +agent\/invoices-api +main +0 +clean +/m);

    const cleaned = await runCli(repoDir, ["agents", "cleanup", "--merged"]);
    expect(cleaned.status).toBe(1); // auth-refactor was kept
    expect(cleaned.stdout).toMatch(/Removed invoices-api/);
    expect(cleaned.stderr).toMatch(/Kept auth-refactor: 1 uncommitted file/);
  });

  it("--count with --scaffold adds a feature skeleton from a repo template", async () => {
    write(
      repoDir,
      ".skelpro/templates/feature-module.json",
      JSON.stringify({
        skelpro: 2,
        variables: { featureName: { type: "string" } },
        files: { src: { "{{kebab featureName}}": { "index.ts": "export const feature = '{{featureName}}';\n" } } },
      }),
    );
    await git(["add", "."]);
    await git(["commit", "-q", "-m", "template"]);

    const r = await runCli(repoDir, [
      "agents", "spawn", "--count", "2", "--prefix", "try", "--scaffold", "feature-module", "--var", "featureName=invoices",
    ]);
    expect(r.status, r.stderr).toBe(0);
    for (const n of ["try-1", "try-2"]) {
      expect(fs.readFileSync(path.join(agentsRoot, n, "src", "invoices", "index.ts"), "utf8")).toBe(
        "export const feature = 'invoices';\n",
      );
    }
  });

  it("fails outside a repository, and for an unknown template, before creating anything", async () => {
    const outside = await runCli(work, ["agents", "list"]);
    expect(outside.status).toBe(1);
    expect(outside.stderr).toMatch(/isn't inside a Git repository/);

    const badTemplate = await runCli(repoDir, ["agents", "spawn", "a", "--scaffold", "nope"]);
    expect(badTemplate.status).toBe(1);
    expect(badTemplate.stderr).toMatch(/No template named "nope"/);
    expect(fs.existsSync(agentsRoot)).toBe(false);
  });

  it("create --worktree still works, with a deprecation notice", async () => {
    write(work, "t.json", JSON.stringify({ "a.txt": "a" }));
    const r = await runCli(work, ["create", "proj", "./t.json", "--worktree", "--branch", "feat"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/create --worktree is deprecated.*skelpro agents spawn/);
  });
});
