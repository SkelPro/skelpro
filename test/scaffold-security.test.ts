import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import scaffoldJSON from "../src/hooks/scaffoldJSON";
import { safeJoin } from "../src/utils/paths";

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-sec-"));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

/** Every file under dir, as sorted relative paths. */
function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter((p) => fs.statSync(path.join(dir, p)).isFile())
    .sort();
}

describe("safeJoin", () => {
  const root = path.resolve("/project");

  it("allows normal nested paths", () => {
    expect(safeJoin(root, "src/index.ts")).toBe(path.join(root, "src", "index.ts"));
  });

  it("allows names that merely start with dots", () => {
    expect(safeJoin(root, "..config")).toBe(path.join(root, "..config"));
  });

  it.each([
    ["parent traversal", "../escaped.txt"],
    ["deep traversal", "../../.bashrc"],
    ["traversal after a folder", "src/../../x"],
    ["absolute posix path", "/etc/passwd"],
    ["null byte", "file\0.txt"],
    ["drive-relative windows path", "C:evil.txt"],
    ["the root itself", "."],
    ["empty key", ""],
  ])("refuses %s", (_label, key) => {
    expect(() => safeJoin(root, key)).toThrow();
  });
});

describe("scaffoldJSON path safety", () => {
  it("refuses a top-level ../ key and writes nothing", () => {
    const target = path.join(workDir, "proj");
    expect(() =>
      scaffoldJSON(target, { "ok.txt": "fine", "../escaped.txt": "pwned" }),
    ).toThrow(/escapes project folder/);

    expect(fs.existsSync(path.join(workDir, "escaped.txt"))).toBe(false);
    expect(listFiles(target)).toEqual([]);
  });

  it("refuses a nested key that escapes the real project root", () => {
    const target = path.join(workDir, "proj");
    // "src" + "../../x" stays inside "src"'s parent only if checked against src;
    // checked against the real root it escapes.
    expect(() =>
      scaffoldJSON(target, { src: { "../../escaped.txt": "pwned" } }),
    ).toThrow(/escapes project folder/);

    expect(fs.existsSync(path.join(workDir, "escaped.txt"))).toBe(false);
    expect(listFiles(target)).toEqual([]);
  });

  it("refuses absolute keys and writes nothing", () => {
    const target = path.join(workDir, "proj");
    const abs = path.join(workDir, "abs.txt");
    expect(() => scaffoldJSON(target, { "a.txt": "a", [abs]: "pwned" })).toThrow();

    expect(fs.existsSync(abs)).toBe(false);
    expect(listFiles(target)).toEqual([]);
  });

  it("ignores non-file settings such as the v1 worktree flag", () => {
    const target = path.join(workDir, "proj");
    scaffoldJSON(target, { "a.txt": "a", worktree: true } as never);
    expect(listFiles(target)).toEqual(["a.txt"]);
  });
});
