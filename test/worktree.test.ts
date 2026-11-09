import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createGitWorktree, worktreeDirFor } from "../src/hooks/createWorktree";
import { cleanupWorktree, listWorktrees } from "../src/hooks/cleanupWorktree";
import { validateBranchName } from "../src/utils/git";

let work: string;
let cwd: string;

const git = (args: string[], dir: string) =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();

beforeEach(() => {
  work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-wt-")));
  cwd = process.cwd();
  process.chdir(work);
});

afterEach(() => {
  process.chdir(cwd);
  fs.rmSync(work, { recursive: true, force: true });
});

describe("validateBranchName (B8)", () => {
  it.each(["agent/backend-fix", "feature-1", "try_2"])("accepts %s", (name) => {
    expect(() => validateBranchName(name)).not.toThrow();
  });

  it.each([
    ["empty", ""],
    ["option injection", "--orphan"],
    ["leading dash", "-x"],
    ["shell metacharacters", 'x"; touch pwned; echo "'],
    ["command substitution", "$(touch pwned)"],
    ["double dot", "a..b"],
    ["space", "has space"],
  ])("refuses %s", (_label, name) => {
    expect(() => validateBranchName(name)).toThrow(/Invalid branch name|required/);
    expect(fs.existsSync(path.join(work, "pwned"))).toBe(false);
  });
});

describe("create --worktree", { timeout: 30_000 }, () => {
  it("makes the project a repo and adds a sibling worktree on the branch", async () => {
    const { projectDir, worktreeDir } = await createGitWorktree(
      "app",
      { "README.md": "# app\n" },
      "agent/fix",
    );

    expect(worktreeDir).toBe(worktreeDirFor(projectDir, "agent/fix"));
    expect(path.basename(worktreeDir)).toBe("app-agent-fix");
    // git's core.autocrlf may turn \n into \r\n on checkout; that's fine.
    expect(fs.readFileSync(path.join(worktreeDir, "README.md"), "utf8").replace(/\r\n/g, "\n")).toBe(
      "# app\n",
    );
    expect(git(["branch", "--show-current"], worktreeDir)).toBe("agent/fix");
    expect(listWorktrees(projectDir)).toHaveLength(2);
  });

  it("throws on an invalid branch instead of silently scaffolding", async () => {
    await expect(createGitWorktree("app", { a: "a" }, "bad..name")).rejects.toThrow();
    expect(fs.existsSync(path.join(work, "app"))).toBe(false);
  });
});

describe("cleanup", { timeout: 30_000 }, () => {
  async function setup() {
    return createGitWorktree("app", { "README.md": "# app\n" }, "agent-x");
  }

  it("removes a clean worktree and its merged branch", async () => {
    const { projectDir, worktreeDir } = await setup();
    cleanupWorktree(projectDir, worktreeDir, { branch: "agent-x" });

    expect(fs.existsSync(worktreeDir)).toBe(false);
    expect(listWorktrees(projectDir)).toHaveLength(1);
    expect(git(["branch", "--list", "agent-x"], projectDir)).toBe("");
  });

  it("refuses a worktree with uncommitted changes unless --force", async () => {
    const { projectDir, worktreeDir } = await setup();
    fs.writeFileSync(path.join(worktreeDir, "wip.txt"), "unsaved");

    expect(() => cleanupWorktree(projectDir, worktreeDir)).toThrow(/--force/);
    expect(fs.existsSync(path.join(worktreeDir, "wip.txt"))).toBe(true);

    cleanupWorktree(projectDir, worktreeDir, { force: true });
    expect(fs.existsSync(worktreeDir)).toBe(false);
  });

  it("refuses to delete an unmerged branch unless --force", async () => {
    const { projectDir, worktreeDir } = await setup();
    fs.writeFileSync(path.join(worktreeDir, "work.txt"), "done");
    git(["add", "."], worktreeDir);
    git(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", "work"], worktreeDir);

    expect(() =>
      cleanupWorktree(projectDir, worktreeDir, { branch: "agent-x" }),
    ).toThrow(/not merged|--force/);
    expect(git(["branch", "--list", "agent-x"], projectDir)).toContain("agent-x");

    cleanupWorktree(projectDir, worktreeDir, { branch: "agent-x", force: true });
    expect(git(["branch", "--list", "agent-x"], projectDir)).toBe("");
  });

  it("never deletes a folder that isn't one of the repo's worktrees", async () => {
    const { projectDir } = await setup();
    const stranger = path.join(work, "important");
    fs.mkdirSync(stranger);
    fs.writeFileSync(path.join(stranger, "keep.txt"), "keep");

    expect(() => cleanupWorktree(projectDir, stranger)).toThrow(/not a worktree/);
    expect(fs.existsSync(path.join(stranger, "keep.txt"))).toBe(true);
  });

  it("refuses to remove the main working tree", async () => {
    const { projectDir } = await setup();
    expect(() => cleanupWorktree(projectDir, projectDir)).toThrow(/main working tree/);
    expect(fs.existsSync(path.join(projectDir, "README.md"))).toBe(true);
  });
});
