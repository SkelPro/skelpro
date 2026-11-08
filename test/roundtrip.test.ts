import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import createJSON from "../src/hooks/createJSON";
import scaffoldJSON from "../src/hooks/scaffoldJSON";
import { decodeBinary } from "../src/utils/files";

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-rt-"));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

// Smallest valid PNG (1x1 transparent pixel); contains null bytes.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
// Arbitrary binary with an extension that is not an image (e.g. a font).
const FONT = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x0a, 0xff, 0xfe, 0x00, 0x42]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>\n';

function write(rel: string, content: string | Buffer) {
  const full = path.join(workDir, "src", rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function readTree(dir: string): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  for (const rel of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const full = path.join(dir, rel);
    if (fs.statSync(full).isFile()) out[rel.split(path.sep).join("/")] = fs.readFileSync(full);
  }
  return out;
}

describe("save → scaffold round-trip", () => {
  beforeEach(() => {
    write("README.md", "# Hello\n");
    write("assets/logo.png", PNG);
    write("assets/icon.svg", SVG);
    write("fonts/brand.woff2", FONT);
    write("lib/bin/tool.sh", "#!/bin/sh\necho hi\n"); // B3: nested bin/ must survive
    write(".env", "SECRET=1\n"); // must never be saved
  });

  it("stores images as real base64 data URIs (B2)", () => {
    const tpl = createJSON(path.join(workDir, "src")) as any;
    expect(tpl.assets["logo.png"]).toMatch(/^data:image\/png;base64,/);
    expect(decodeBinary(tpl.assets["logo.png"])!.equals(PNG)).toBe(true);
  });

  it("stores non-image binaries as base64 and SVG as text", () => {
    const tpl = createJSON(path.join(workDir, "src")) as any;
    expect(tpl.fonts["brand.woff2"]).toMatch(/^data:application\/octet-stream;base64,/);
    expect(tpl.assets["icon.svg"]).toBe(SVG);
  });

  it("reproduces every file byte for byte", () => {
    const tpl = JSON.parse(JSON.stringify(createJSON(path.join(workDir, "src"))));
    const out = path.join(workDir, "out");
    scaffoldJSON(out, tpl);

    const before = readTree(path.join(workDir, "src"));
    const after = readTree(out);

    expect(after[".env"]).toBeUndefined();
    expect(after["lib/bin/tool.sh"]).toBeDefined();
    delete before[".env"];

    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const key of Object.keys(before)) {
      expect(after[key].equals(before[key]), key).toBe(true);
    }
  });

  it("still decodes image data URIs from older templates", () => {
    const out = path.join(workDir, "legacy");
    scaffoldJSON(out, { "logo.png": `data:image/png;base64,${PNG.toString("base64")}` });
    expect(fs.readFileSync(path.join(out, "logo.png")).equals(PNG)).toBe(true);
  });
});
