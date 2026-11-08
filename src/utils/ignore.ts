import fs from "fs";
import path from "path";
import ignore, { type Ignore } from "ignore";
import { minimatch } from "minimatch";

/**
 * Things that are never source, at any depth. Kept deliberately short: the
 * project's own .gitignore covers everything else.
 */
export const BUILTIN_IGNORES: string[] = [
  "node_modules/",
  ".git",
  ".DS_Store",
  "Thumbs.db",
  "__pycache__/",
  "*.pyc",
  ".env",
  ".env.*",
  "!.env.example",
  "*.pem",
  "*.key",

  // Build output and local environments, anchored to the project root so a
  // nested `lib/bin` or `src/build` folder is kept.
  "/dist/",
  "/build/",
  "/out/",
  "/target/",
  "/coverage/",
  "/.next/",
  "/.nuxt/",
  "/.output/",
  "/venv/",
  "/.venv/",
];

export interface IgnoreOptions {
  /** Globs that are always kept, even if an ignore rule matches. */
  include?: string[];
  /** Extra globs to skip, on top of .gitignore and the built-in list. */
  exclude?: string[];
}

export interface IgnoreMatcher {
  /** relPath is relative to the project root, using either separator. */
  ignores(relPath: string, isDirectory: boolean): boolean;
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/").replace(/\\/g, "/");
}

export function createIgnoreMatcher(
  rootDir: string,
  options: IgnoreOptions = {},
): IgnoreMatcher {
  const ig: Ignore = ignore().add(BUILTIN_IGNORES);

  const gitignorePath = path.join(rootDir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, "utf8"));
  }

  const include = options.include ?? [];
  const exclude = options.exclude ?? [];
  const globOpts = { dot: true, matchBase: false };

  return {
    ignores(relPath, isDirectory) {
      const rel = toPosix(relPath);

      if (include.length) {
        // A file is kept if it matches; a folder is kept if something inside
        // it could match, so the walk still reaches the included files.
        const kept = include.some(
          (glob) =>
            minimatch(rel, glob, globOpts) ||
            (isDirectory && minimatch(rel, glob, { ...globOpts, partial: true })),
        );
        if (kept) return false;
      }

      if (exclude.some((glob) => minimatch(rel, glob, globOpts))) {
        return true;
      }

      return ig.ignores(isDirectory ? `${rel}/` : rel);
    },
  };
}
