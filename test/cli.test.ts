import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VERSION } from "../src/utils/constant";
import { updatesDisabled } from "../src/hooks/logUpdates";

const ROOT = path.resolve(__dirname, "..");
const TS_NODE = path.join(ROOT, "node_modules", "ts-node", "dist", "bin.js");

let work: string;

beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-cli-"));
});

afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

/** Runs the real CLI from source with update checks switched off. */
function cli(...args: string[]) {
  return spawnSync(
    process.execPath,
    [TS_NODE, "--transpile-only", path.join(ROOT, "cli.ts"), ...args],
    {
      cwd: work,
      encoding: "utf8",
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
    },
  );
}

describe("VERSION (B6)", () => {
  it("comes from package.json", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });
});

describe("package.json (B6)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  it("ships a skelpro bin that the build actually produces", () => {
    expect(pkg.bin.skelpro).toBe("dist/cli.js");
    const tsconfig = fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf8");
    expect(tsconfig).toMatch(/"outDir":\s*"\.\/dist"/);
  });

  it("uses a valid SPDX license", () => {
    expect(pkg.license).toBe("Apache-2.0");
  });
});

describe("updatesDisabled (B9)", () => {
  it.each([
    [{}, false, false],
    [{}, true, true],
    [{ CI: "true" }, false, true],
    [{ CI: "1" }, false, true],
    [{ CI: "false" }, false, false],
    [{ NO_UPDATE_NOTIFIER: "1" }, false, true],
  ])("env %j quiet=%s → %s", (env, quiet, expected) => {
    expect(updatesDisabled(quiet, env as NodeJS.ProcessEnv)).toBe(expected);
  });
});

describe("exit codes (B7)", { timeout: 60_000 }, () => {
  it("exits 0 and scaffolds on success", () => {
    fs.writeFileSync(path.join(work, "t.json"), JSON.stringify({ "a.txt": "a" }));
    const r = cli("create", "app", "./t.json");
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(work, "app", "a.txt"), "utf8")).toBe("a");
  });

  it("exits 1 when the template file is missing", () => {
    const r = cli("create", "app", "./missing.json");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Error:/);
  });

  it("exits 1 and writes nothing for a path-escaping template", () => {
    fs.writeFileSync(path.join(work, "t.json"), JSON.stringify({ "../escaped.txt": "x" }));
    const r = cli("create", "app", "./t.json");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/escapes project folder|Unsafe template path/);
    expect(fs.existsSync(path.join(path.dirname(work), "escaped.txt"))).toBe(false);
  });

  it("exits 1 for --worktree without --branch", () => {
    fs.writeFileSync(path.join(work, "t.json"), "{}");
    const r = cli("create", "app", "./t.json", "--worktree");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--branch is required/);
  });
});
