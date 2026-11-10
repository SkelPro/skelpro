import fs from "fs";
import { execFileSync } from "child_process";
import { COMPILED_DIR, REPO_ROOT } from "./helpers/paths";

/**
 * Compiles the CLI once before any test runs. CLI tests then start it with
 * plain `node`, instead of ts-node recompiling the whole project for every
 * single command, which made parallel test files slow enough to time out.
 */
export default function setup(): void {
  fs.rmSync(COMPILED_DIR, { recursive: true, force: true });
  execFileSync(
    process.execPath,
    [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json", "--outDir", COMPILED_DIR],
    { cwd: REPO_ROOT, stdio: "inherit" },
  );
}
