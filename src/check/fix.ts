/**
 * `skelpro check --fix`: the only fix that is always safe is creating a
 * missing required folder. Nothing is ever moved, renamed or deleted;
 * naming problems get a suggested `git mv` in the report instead.
 */
import fs from "fs";
import path from "path";
import { safeJoin } from "../utils/paths";
import type { CheckConfig, ProjectPaths } from "./check";

/** Git can't commit an empty folder, so each new folder gets one of these. */
export const KEEP_FILE = ".gitkeep";

/** Creates each missing required folder (with a .gitkeep); returns what it created. */
export function fixMissingFolders(root: string, config: CheckConfig, project: ProjectPaths): string[] {
  const existing = new Set(project.dirs);
  const created: string[] = [];

  for (const [p, entry] of Object.entries(config.layout)) {
    if (!entry.required || existing.has(p)) continue;

    const dir = safeJoin(root, p); // layout paths are validated, but never trust a path we write to
    if (fs.existsSync(dir)) {
      if (!fs.statSync(dir).isDirectory()) {
        throw new Error(`Can't create ${p}/: a file with that name already exists.`);
      }
      continue; // exists, just skipped by the ignore rules
    }
    fs.mkdirSync(dir, { recursive: true });

    const keep = path.join(dir, KEEP_FILE);
    if (!fs.readdirSync(dir).length) fs.writeFileSync(keep, "", { flag: "wx" });
    created.push(`${p}/`);
  }

  return created;
}
