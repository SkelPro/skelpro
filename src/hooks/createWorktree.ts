import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { toneLevel } from "tonelog";
import scaffoldJSON from "./scaffoldJSON";
import type { JsonStructure } from "../types/structures";

export async function createGitWorktree(baseName: string, structure: JsonStructure) {
  const worktreePath = path.resolve(baseName);
  const branchName = `agent-${baseName.replace(/[^a-zA-Z0-9-]/g, '-')}`;

  try {
    // Ensure we're in a git repo
    execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });

    console.log(toneLevel.info(`Creating Git worktree with branch: ${branchName} at ${worktreePath}`));

    execSync(`git worktree add -b \( {branchName} " \){worktreePath}" main`, { stdio: "inherit" });

    // Scaffold the structure inside the worktree
    scaffoldJSON(worktreePath, structure);

    console.log(toneLevel.success(`Agent worktree + branch '${branchName}' created successfully.`, "done"));
  } catch (error) {
    console.error("Worktree creation failed:", (error as Error).message);
    console.log("Falling back to regular scaffolding...");
    scaffoldJSON(baseName, structure);
  }
}