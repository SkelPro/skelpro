import path from "path";

/** Repository root (Vitest runs from here). */
export const REPO_ROOT = process.cwd();

/**
 * Where test/global-setup.ts compiles the CLI once per test run. Kept out of
 * dist/ so tests never pick up a stale build, and inside node_modules so the
 * compiled code still resolves the project's dependencies.
 */
export const COMPILED_DIR = path.join(REPO_ROOT, "node_modules", ".cache", "skelpro-test-dist");
export const COMPILED_CLI = path.join(COMPILED_DIR, "cli.js");
