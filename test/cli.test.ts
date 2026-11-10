import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "./helpers/run-cli";

import { VERSION } from "../src/utils/constant";
import { updatesDisabled } from "../src/hooks/logUpdates";

const ROOT = path.resolve(__dirname, "..");

let work: string;

beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-cli-"));
});

afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

const cli = (...args: string[]) => runCli(work, args);

describe("VERSION (B6)", () => {
  it("comes from package.json", async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });
});

describe("package.json (B6)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  it("ships a skelpro bin that the build actually produces", async () => {
    expect(pkg.bin.skelpro).toBe("dist/cli.js");
    const tsconfig = fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf8");
    expect(tsconfig).toMatch(/"outDir":\s*"\.\/dist"/);
  });

  it("uses a valid SPDX license", async () => {
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
  it("exits 0 and scaffolds on success", async () => {
    fs.writeFileSync(path.join(work, "t.json"), JSON.stringify({ "a.txt": "a" }));
    const r = await cli("create", "app", "./t.json");
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(work, "app", "a.txt"), "utf8")).toBe("a");
  });

  it("exits 1 when the template file is missing", async () => {
    const r = await cli("create", "app", "./missing.json");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Error:/);
  });

  it("exits 1 and writes nothing for a path-escaping template", async () => {
    fs.writeFileSync(path.join(work, "t.json"), JSON.stringify({ "../escaped.txt": "x" }));
    const r = await cli("create", "app", "./t.json");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/escapes project folder|Unsafe template path/);
    expect(fs.existsSync(path.join(path.dirname(work), "escaped.txt"))).toBe(false);
  });

  it("exits 1 for --worktree without --branch", async () => {
    fs.writeFileSync(path.join(work, "t.json"), "{}");
    const r = await cli("create", "app", "./t.json", "--worktree");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--branch is required/);
  });
});
