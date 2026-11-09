import path from "path";

/**
 * Checks a single template key (one level of the tree) on its own, before
 * it is joined to its parent folder. Joining first would quietly turn a
 * nested "/etc/x" into "src/etc/x", or "src" + "../x" into "x". Templates
 * never need either, so both are refused.
 */
export function assertSafeKey(key: string): void {
  const segments = key.split(/[\\/]+/);
  if (
    !key ||
    key.includes("\0") ||
    path.isAbsolute(key) ||
    /^[a-zA-Z]:/.test(key) ||
    segments.includes("..")
  ) {
    throw new Error(`Unsafe template path: ${JSON.stringify(key)}`);
  }
}

/**
 * Joins a template key onto the project root, refusing anything that would
 * land outside it. Template keys come from JSON files that may be remote, so
 * they are untrusted input.
 */
export function safeJoin(root: string, key: string): string {
  if (!key || path.isAbsolute(key) || key.includes("\0")) {
    throw new Error(`Unsafe template path: ${JSON.stringify(key)}`);
  }

  // Windows treats "C:foo" as drive-relative, which path.isAbsolute misses.
  if (/^[a-zA-Z]:/.test(key)) {
    throw new Error(`Unsafe template path: ${JSON.stringify(key)}`);
  }

  const resolvedRoot = path.resolve(root);
  const full = path.resolve(resolvedRoot, key);
  const rel = path.relative(resolvedRoot, full);

  if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`Template path escapes project folder: ${key}`);
  }

  return full;
}
