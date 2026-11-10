import fs from "fs";
import path from "path";
import { toneLevel } from "tonelog";
import scaffoldJSON from "./scaffoldJSON";
import type { JsonStructure } from "../types/structures";
import { git, validateBranchName } from "../utils/git";

export interface WorktreeResult {
  projectDir: string;
  worktreeDir: string;
}

function hasGitIdentity(cwd: string): boolean {
  try {
    return git(["config", "user.email"], cwd).length > 0;
  } catch {
    return false; // `git config` exits 1 when the key is unset
  }
}

/** Sibling folder name for a worktree: my-app + feat/x → my-app-feat-x */
export function worktreeDirFor(projectDir: string, branchName: string): string {
  return `${path.resolve(projectDir)}-${branchName.replace(/[\\/]+/g, "-")}`;
}

/**
 * Scaffolds the project as its own Git repository, commits it, then adds a
 * worktree on `branchName` in a sibling folder. Throws on any failure; it
 * never falls back to plain scaffolding, so callers get a real error.
 */
export async function createGitWorktree(
  baseName: string,
  structure: JsonStructure,
  branchName: string,
): Promise<WorktreeResult> {
  validateBranchName(branchName);

  const projectDir = path.resolve(baseName);
  const worktreeDir = worktreeDirFor(projectDir, branchName);

  if (fs.existsSync(worktreeDir)) {
    throw new Error(`Worktree folder already exists: ${worktreeDir}`);
  }

  scaffoldJSON(projectDir, structure);

  if (!fs.existsSync(path.join(projectDir, ".git"))) {
    git(["init"], projectDir);
  }

  git(["add", "-A"], projectDir);

  // Fresh machines and CI often have no git identity; don't fail on that.
  const identity = hasGitIdentity(projectDir)
    ? []
    : ["-c", "user.name=SkelPro", "-c", "user.email=skelpro@localhost"];
  try {
    git([...identity, "commit", "--allow-empty", "-m", "Initial commit from SkelPro"], projectDir);
  } catch (error) {
    throw new Error(`Could not create the initial commit: ${(error as Error).message}`);
  }

  console.log(
    toneLevel.info(`Creating Git worktree with branch: ${branchName} at ${worktreeDir}`),
  );
  git(["worktree", "add", "-b", branchName, worktreeDir, "HEAD"], projectDir);

  console.log(
    toneLevel.success(
      `Agent worktree + branch '${branchName}' created successfully.`,
      "done",
    ),
  );

  return { projectDir, worktreeDir };
}
