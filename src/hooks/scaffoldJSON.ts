import fs from "fs";
import path from "path";

import type { JsonStructure } from "../types/structures";
import { decodeBinary } from "../utils/files";
import { assertSafeKey, safeJoin } from "../utils/paths";

export type PlannedEntry =
  | { kind: "dir"; path: string }
  | { kind: "file"; path: string; content: string | Buffer };

/**
 * Walks the template and resolves every path against the project root.
 * Throws on the first unsafe key, before anything has been written.
 */
function planStructure(
  root: string,
  relDir: string,
  structure: JsonStructure,
  plan: PlannedEntry[],
): void {
  for (const key of Object.keys(structure)) {
    const value: unknown = structure[key];
    assertSafeKey(key);
    const relPath = relDir ? path.join(relDir, key) : key;
    const fullPath = safeJoin(root, relPath);

    // No ignore rules here: if a template contains a file, its author wanted it.
    if (typeof value === "string") {
      plan.push({
        kind: "file",
        path: fullPath,
        content: decodeBinary(value) ?? value,
      });
    } else if (typeof value === "object" && value !== null) {
      plan.push({ kind: "dir", path: fullPath });
      planStructure(root, relPath, value as JsonStructure, plan);
    }
    // Other values (e.g. the v1 `worktree: true` flag) are settings, not files.
  }
}

/**
 * Every folder and file a tree would create under `dir`, with each path
 * checked (no absolute paths, no .., nothing outside the project).
 * Throws on the first unsafe path, before anything is written.
 */
export function planScaffold(dir: string, structure: JsonStructure): PlannedEntry[] {
  const plan: PlannedEntry[] = [];
  planStructure(path.resolve(dir), "", structure, plan);
  return plan;
}

/** Writes a plan from planScaffold. */
export function writePlan(dir: string, plan: PlannedEntry[]): void {
  fs.mkdirSync(path.resolve(dir), { recursive: true });
  for (const entry of plan) {
    if (entry.kind === "dir") {
      fs.mkdirSync(entry.path, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(entry.path), { recursive: true });
      fs.writeFileSync(entry.path, entry.content);
    }
  }
}

export default function scaffoldJSON(
  dir: string,
  structure: JsonStructure,
): void {
  // Validate the whole template first, so a bad template writes zero files.
  writePlan(dir, planScaffold(dir, structure));
}
