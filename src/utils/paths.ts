import path from "path";

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
