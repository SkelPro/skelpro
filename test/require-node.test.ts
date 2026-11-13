import path from "path";
import { spawnSync } from "child_process";
import { describe, expect, it } from "vitest";

import { MIN_NODE_MAJOR, isSupportedNode } from "../src/utils/require-node";
import { COMPILED_DIR } from "./helpers/paths";

describe("Node.js version check", () => {
  it("requires Node.js 20", () => {
    expect(MIN_NODE_MAJOR).toBe(20);
  });

  it.each([
    ["v18.20.4", false],
    ["v19.9.0", false],
    ["v20.0.0", true],
    ["v22.12.0", true],
    ["24.1.0", true],
    ["nonsense", false],
  ])("%s supported: %s", (version, expected) => {
    expect(isSupportedNode(version)).toBe(expected);
  });

  it("stops with a clear message on an old Node.js", { timeout: 30_000 }, () => {
    // Pretend to be Node 18, then load the compiled check the way cli.js does.
    const checkModule = path.join(COMPILED_DIR, "src", "utils", "require-node.js");
    const r = spawnSync(
      process.execPath,
      ["-e", `Object.defineProperty(process, "version", { value: "v18.20.4" }); require(${JSON.stringify(checkModule)});`],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/SkelPro requires Node\.js 20 or newer; you are running v18\.20\.4/);
    expect(r.stderr).toMatch(/skelpro@1\.6\.0/);
  });

  it("loads before anything else in the CLI", async () => {
    const fs = await import("fs");
    const compiled = fs.readFileSync(path.join(COMPILED_DIR, "cli.js"), "utf8");
    const firstRequire = /require\("([^"]+)"\)/.exec(compiled)?.[1];
    expect(firstRequire).toBe("./src/utils/require-node");
  });
});
