import { execFileSync, type ExecFileSyncOptions } from "child_process";

/**
 * Runs git with an argument array (never through a shell), so branch names
 * and paths cannot inject commands. Returns trimmed stdout.
 */
export function git(args: string[], cwd: string, options: ExecFileSyncOptions = {}): string {
  try {
    const out = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    return String(out ?? "").trim();
  } catch (error) {
    const err = error as { stderr?: Buffer | string; message: string };
    const detail = String(err.stderr ?? "").trim() || err.message;
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
}

/**
 * Throws unless `name` is a valid branch name. Leading dashes are refused
 * up front so a name can never be read as a git option.
 */
export function validateBranchName(name: string): void {
  if (!name || !name.trim()) {
    throw new Error("Branch name is required.");
  }
  if (name.startsWith("-")) {
    throw new Error(`Invalid branch name: ${name}`);
  }
  try {
    execFileSync("git", ["check-ref-format", "--branch", name], { stdio: "ignore" });
  } catch {
    throw new Error(`Invalid branch name: ${name}`);
  }
}
