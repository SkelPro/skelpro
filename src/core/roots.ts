import fs from "fs";
import path from "path";
import { SkelproError } from "./errors";

/**
 * The real path of `p`, resolving symlinks through the nearest folder that
 * exists, so a symlink inside an allowed root can't lead outside it.
 */
function realPath(p: string): string {
  const resolved = path.resolve(p);
  const missing: string[] = [];
  let current = resolved;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return resolved;
    missing.unshift(path.basename(current));
    current = parent;
  }
  const real = fs.realpathSync.native(current);
  return path.join(real, ...missing);
}

function isInside(child: string, parent: string): boolean {
  const norm = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);
  const rel = path.relative(norm(parent), norm(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Throws unless `target` is inside one of `roots` (after resolving symlinks). */
export function assertInsideRoots(target: string, roots: string[], what = "targetDir"): string {
  const resolved = path.resolve(target);
  const real = realPath(resolved);
  if (roots.some((root) => isInside(real, realPath(root)))) return resolved;

  throw new SkelproError(
    "outside_allowed_roots",
    `${what} ${resolved} is outside the folders SkelPro may write to.`,
    `Use a path inside ${roots.join(" or ")}, or restart the server with --root <folder> to allow another folder.`,
  );
}
