import fs from "fs";
import path from "path";
import { toneLevel } from "tonelog";
import { git, validateBranchName } from "../utils/git";

export interface CleanupOptions {
  branch?: string;
  /** Remove a worktree with uncommitted changes / delete an unmerged branch. */
  force?: boolean;
}

/**
 * Canonical form of a path for comparison. git prints long, symlink-free
 * paths, while users may pass Windows 8.3 short names (SYDNEY~1) or macOS
 * /var vs /private/var, so resolve the real path when it exists.
 */
function canonical(p: string): string {
  let r = path.resolve(p);
  try {
    r = fs.realpathSync.native(r);
  } catch {
    // path no longer exists; compare as given
  }
  return process.platform === "win32" ? r.toLowerCase() : r;
}

function samePath(a: string, b: string): boolean {
  return canonical(a) === canonical(b);
}

/** Paths of every worktree git knows about for this repo (main one first). */
export function listWorktrees(repoDir: string): string[] {
  return git(["worktree", "list", "--porcelain"], repoDir)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => path.resolve(line.slice("worktree ".length)));
}

export function cleanupWorktree(
  repoPath: string,
  worktreePath: string,
  options: CleanupOptions = {},
): void {
  const repoDir = path.resolve(repoPath);
  const worktreeDir = path.resolve(worktreePath);

  if (options.branch) validateBranchName(options.branch);

  if (!fs.existsSync(repoDir)) {
    throw new Error(`Repository path does not exist: ${repoDir}`);
  }

  const worktrees = listWorktrees(repoDir);

  if (worktrees.length && samePath(worktrees[0], worktreeDir)) {
    throw new Error(`Refusing to remove the main working tree: ${worktreeDir}`);
  }

  const registered = worktrees.some((w) => samePath(w, worktreeDir));

  if (registered) {
    console.log(toneLevel.info(`Removing worktree: ${worktreeDir}`));
    try {
      git(
        ["worktree", "remove", ...(options.force ? ["--force"] : []), worktreeDir],
        repoDir,
      );
    } catch (error) {
      throw new Error(
        `${(error as Error).message}\nThe worktree has uncommitted or untracked changes ` +
          `that would be lost. Commit them, or re-run with --force to discard them.`,
      );
    }
  } else if (fs.existsSync(worktreeDir)) {
    // Never delete a folder git doesn't recognise as one of its worktrees.
    throw new Error(
      `${worktreeDir} is not a worktree of ${repoDir}; refusing to delete it.`,
    );
  }

  git(["worktree", "prune"], repoDir);

  // Leftovers git has already let go of (e.g. files locked on Windows).
  if (registered && fs.existsSync(worktreeDir)) {
    fs.rmSync(worktreeDir, { recursive: true, force: true });
  }

  if (options.branch) {
    try {
      git(["branch", options.force ? "-D" : "-d", options.branch], repoDir);
    } catch (error) {
      throw new Error(
        `${(error as Error).message}\nBranch '${options.branch}' has commits that are not ` +
          `merged; deleting it would lose them. Merge it first, or re-run with --force.`,
      );
    }
  }

  console.log(toneLevel.success(`Worktree cleaned up successfully.`, "done"));
}
