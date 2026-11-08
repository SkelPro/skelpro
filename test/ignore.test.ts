import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import createJSON from "../src/hooks/createJSON";
import scaffoldJSON from "../src/hooks/scaffoldJSON";
import { createIgnoreMatcher } from "../src/utils/ignore";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-ign-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content = "x") {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe("built-in ignore list", () => {
  const m = () => createIgnoreMatcher(root);

  it.each([
    ["node_modules", true],
    ["packages/a/node_modules", true],
    [".git", true],
    ["__pycache__", true],
  ])("ignores folder %s", (rel, _expected) => {
    expect(m().ignores(rel, true)).toBe(true);
  });

  it.each([".env", ".env.local", "config/.env.production", "certs/server.pem", "id.key", "a.pyc", ".DS_Store"])(
    "ignores file %s",
    (rel) => {
      expect(m().ignores(rel, false)).toBe(true);
    },
  );

  it("keeps .env.example", () => {
    expect(m().ignores(".env.example", false)).toBe(false);
  });

  it("ignores build folders only at the top level", () => {
    expect(m().ignores("dist", true)).toBe(true);
    expect(m().ignores("build", true)).toBe(true);
    expect(m().ignores("src/build", true)).toBe(false);
    expect(m().ignores("packages/core/dist", true)).toBe(false);
  });

  it.each(["lib/bin", "env", "vendor", "logs", "tmp", "src/out", "bin"])(
    "keeps real source folder %s",
    (rel) => {
      expect(m().ignores(rel, true)).toBe(false);
    },
  );

  it("keeps lockfiles so install detection works", () => {
    expect(m().ignores("package-lock.json", false)).toBe(false);
    expect(m().ignores("yarn.lock", false)).toBe(false);
  });
});

describe("project .gitignore", () => {
  it("applies the project's own rules", () => {
    write(".gitignore", "generated/\n*.secret\n");
    const m = createIgnoreMatcher(root);
    expect(m.ignores("generated", true)).toBe(true);
    expect(m.ignores("src/db.secret", false)).toBe(true);
    expect(m.ignores("src/index.ts", false)).toBe(false);
  });
});

describe("--include / --exclude", () => {
  it("--exclude skips extra paths", () => {
    const m = createIgnoreMatcher(root, { exclude: ["docs/**"] });
    expect(m.ignores("docs/a.md", false)).toBe(true);
  });

  it("--include rescues an ignored file and its folder", () => {
    const m = createIgnoreMatcher(root, { include: ["dist/**"] });
    expect(m.ignores("dist", true)).toBe(false);
    expect(m.ignores("dist/index.js", false)).toBe(false);
  });

  it("createJSON reports what it skipped", () => {
    write("src/index.ts");
    write(".env", "SECRET=1");
    write("node_modules/x/index.js");
    const skipped: string[] = [];
    const tpl = createJSON(root, { skipped });
    expect(Object.keys(tpl).sort()).toEqual(["src"]);
    expect(skipped.sort()).toEqual([".env", "node_modules/"]);
  });
});

describe("scaffold does not apply ignore rules", () => {
  it("writes every file the template contains", () => {
    const out = path.join(root, "out");
    scaffoldJSON(out, { dist: { "index.js": "x" }, ".env.example": "A=1", bin: { run: "y" } });
    expect(fs.existsSync(path.join(out, "dist", "index.js"))).toBe(true);
    expect(fs.existsSync(path.join(out, ".env.example"))).toBe(true);
    expect(fs.existsSync(path.join(out, "bin", "run"))).toBe(true);
  });
});
