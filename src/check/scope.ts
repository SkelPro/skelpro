/**
 * --staged / --changed: limit `skelpro check` to the files being changed,
 * so a pre-commit hook only reports problems in what's being committed.
 */
import { git } from "../utils/git";
import type { Finding } from "./check";

export type CheckScope = "staged" | "changed";

const NUL_LIST = (out: string) => out.split("\0").filter(Boolean).map((p) => p.replace(/\\/g, "/"));

/**
 * Files added, copied, modified or renamed, relative to `dir` (which may be
 * a folder inside a bigger repository). Deleted files are left out: there
 * is nothing left to check.
 *
 * - staged: what `git commit` would commit (use this in pre-commit hooks)
 * - changed: staged, unstaged and untracked files
 */
export function changedPaths(dir: string, scope: CheckScope): string[] {
  try {
    git(["rev-parse", "--is-inside-work-tree"], dir);
  } catch {
    throw new Error(`--${scope} needs a Git repository, and ${dir} isn't inside one.`);
  }

  const diff = (extra: string[]) =>
    NUL_LIST(git(["diff", "--name-only", "--relative", "--diff-filter=ACMR", "-z", ...extra], dir));

  const paths = new Set(diff(["--cached"]));
  if (scope === "changed") {
    for (const p of diff([])) paths.add(p);
    for (const p of NUL_LIST(git(["ls-files", "--others", "--exclude-standard", "-z"], dir))) paths.add(p);
  }
  return [...paths].sort();
}

/**
 * Keeps findings about a changed file, or about a folder that contains one
 * (such as an unknown top-level folder something was just added to).
 * Project-wide findings (a missing required folder, a TODO purpose) aren't
 * about any change, so they're left to a full check.
 */
export function limitToPaths(findings: Finding[], changed: string[]): Finding[] {
  const set = new Set(changed);
  return findings.filter((f) => {
    if (f.path.endsWith("/")) {
      if (f.rule === "required" || f.rule === "todo") return false;
      return changed.some((p) => p.startsWith(f.path));
    }
    return set.has(f.path);
  });
}
