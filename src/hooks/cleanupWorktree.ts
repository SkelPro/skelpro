import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { toneLevel } from "tonelog";

export function cleanupWorktree(worktreePath: string) {
  try {
    const absPath = path.resolve(worktreePath);

    if (!fs.existsSync(absPath)) {
      console.error(toneLevel.error(`Worktree path does not exist: ${absPath}`));
      return;
    }

    console.log(toneLevel.info(`Removing worktree: ${absPath}`));

    execSync(`git worktree remove "${absPath}" --force`, { stdio: "inherit" });
    execSync(`git worktree prune`, { stdio: "inherit" });

    // Remove directory
    fs.rmSync(absPath, { recursive: true, force: true });

    console.log(toneLevel.success(`Worktree cleaned up successfully.`, "done"));
  } catch (error) {
    console.error("Cleanup failed:", (error as Error).message);
  }
}