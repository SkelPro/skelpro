import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const TS_NODE = path.join(ROOT, "node_modules", "ts-node", "dist", "bin.js");

let work: string;

/** Runs the real CLI with a non-terminal stdin, like an agent or CI would. */
function cli(...args: string[]) {
  return spawnSync(
    process.execPath,
    [TS_NODE, "--transpile-only", path.join(ROOT, "cli.ts"), ...args],
    {
      cwd: work,
      encoding: "utf8",
      input: "", // stdin is a closed pipe, never a TTY
      timeout: 60_000,
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
    },
  );
}

const template = {
  skelpro: 2,
  name: "service",
  description: "A tiny service",
  variables: {
    projectName: { type: "string", pattern: "^[a-z0-9-]+$" },
    owner: { type: "string", description: "team that owns it" },
    port: { type: "number", default: 3000 },
    docker: { type: "boolean", default: false },
  },
  files: {
    "README.md": "# {{projectName}}\nOwned by {{owner}} on port {{port}}.\n",
    src: { "{{camel projectName}}.ts": "export const port = {{port}};\n" },
    Dockerfile: { $when: "docker", $content: "FROM node:22\n" },
  },
};

beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-tcli-"));
  fs.writeFileSync(path.join(work, "service.json"), JSON.stringify(template));
});

afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

const read = (rel: string) => fs.readFileSync(path.join(work, rel), "utf8");

describe("create with variables", { timeout: 90_000 }, () => {
  it("renders --var values and defaults", () => {
    const r = cli("create", "billing-api", "./service.json", "--var", "owner=payments", "--var", "docker=true");
    expect(r.status, r.stderr).toBe(0);
    expect(read("billing-api/README.md")).toBe("# billing-api\nOwned by payments on port 3000.\n");
    expect(read("billing-api/src/billingApi.ts")).toBe("export const port = 3000;\n");
    expect(fs.existsSync(path.join(work, "billing-api", "Dockerfile"))).toBe(true);
  });

  it("reads --vars from a JSON file, with --var taking precedence", () => {
    fs.writeFileSync(path.join(work, "answers.json"), JSON.stringify({ owner: "core", port: 9000 }));
    const r = cli("create", "api", "./service.json", "--vars", "answers.json", "--var", "port=8080");
    expect(r.status, r.stderr).toBe(0);
    expect(read("api/README.md")).toBe("# api\nOwned by core on port 8080.\n");
  });

  it("errors instead of hanging when a required variable is missing", () => {
    const r = cli("create", "api", "./service.json");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Missing required variable/);
    expect(r.stderr).toMatch(/owner \(string\): team that owns it/);
    expect(fs.existsSync(path.join(work, "api"))).toBe(false);
  });

  it("--yes never prompts", () => {
    const r = cli("create", "api", "./service.json", "--yes");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Missing required variable/);
  });

  it("exits 1 and writes nothing for an invalid value", () => {
    const r = cli("create", "My App", "./service.json", "--var", "owner=x");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/projectName.*does not match/);
    expect(fs.existsSync(path.join(work, "My App"))).toBe(false);
  });

  it("refuses --var on a v1 template", () => {
    fs.writeFileSync(path.join(work, "v1.json"), JSON.stringify({ "a.txt": "a" }));
    const r = cli("create", "app", "./v1.json", "--var", "x=1");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/v1 template/);
  });
});

describe("save --var", { timeout: 90_000 }, () => {
  it("makes a v2 template that recreates the project under a new name", () => {
    const src = path.join(work, "my-api");
    fs.mkdirSync(path.join(src, "src"), { recursive: true });
    fs.writeFileSync(path.join(src, "package.json"), '{ "name": "my-api" }\n');
    fs.writeFileSync(path.join(src, "src", "MyApi.ts"), "export const port = 3000;\n");

    const saved = cli("save", "node-api", "./my-api", "--var", "projectName=my-api", "--var", "port=3000", "--description", "API");
    expect(saved.status, saved.stderr).toBe(0);
    expect(saved.stdout).toMatch(/projectName: 2 in 2 file\(s\) \(my-api x1, MyApi x1\)/);
    expect(saved.stdout).toMatch(/port: 1 in 1 file\(s\)/);

    const tpl = JSON.parse(read("node-api.json"));
    expect(tpl).toMatchObject({ skelpro: 2, name: "node-api", description: "API" });

    const created = cli("create", "billing", "./node-api.json", "--var", "port=8080");
    expect(created.status, created.stderr).toBe(0);
    expect(read("billing/package.json")).toBe('{ "name": "billing" }\n');
    expect(read("billing/src/Billing.ts")).toBe("export const port = 8080;\n");
  });

  it("warns about values it never found", () => {
    fs.mkdirSync(path.join(work, "p"));
    fs.writeFileSync(path.join(work, "p", "a.txt"), "hello");
    const r = cli("save", "t", "./p", "--var", "owner=nobody");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/owner: value "nobody" was not found/);
  });

  it("refuses --description without --var", () => {
    fs.mkdirSync(path.join(work, "p"));
    fs.writeFileSync(path.join(work, "p", "a.txt"), "hello");
    const r = cli("save", "t", "./p", "--description", "x");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--description only applies to v2/);
  });
});

describe("info", { timeout: 60_000 }, () => {
  it("prints name, variables and files", () => {
    const r = cli("info", "./service.json");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/service \(template v2\)/);
    expect(r.stdout).toMatch(/owner {2}string, required {2}- team that owns it/);
    expect(r.stdout).toMatch(/port {2}number, default 3000/);
    expect(r.stdout).toMatch(/Files \(3\)/);
  });

  it("--json prints only parseable JSON", () => {
    const r = cli("info", "./service.json", "--json");
    expect(r.status, r.stderr).toBe(0);
    const info = JSON.parse(r.stdout);
    expect(info.version).toBe(2);
    expect(Object.keys(info.variables)).toEqual(["projectName", "owner", "port", "docker"]);
    expect(info.files).toContain("Dockerfile");
  });
});
