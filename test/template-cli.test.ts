import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "./helpers/run-cli";


let work: string;

const cli = (...args: string[]) => runCli(work, args);

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
  it("renders --var values and defaults", async () => {
    const r = await cli("create", "billing-api", "./service.json", "--var", "owner=payments", "--var", "docker=true");
    expect(r.status, r.stderr).toBe(0);
    expect(read("billing-api/README.md")).toBe("# billing-api\nOwned by payments on port 3000.\n");
    expect(read("billing-api/src/billingApi.ts")).toBe("export const port = 3000;\n");
    expect(fs.existsSync(path.join(work, "billing-api", "Dockerfile"))).toBe(true);
  });

  it("reads --vars from a JSON file, with --var taking precedence", async () => {
    fs.writeFileSync(path.join(work, "answers.json"), JSON.stringify({ owner: "core", port: 9000 }));
    const r = await cli("create", "api", "./service.json", "--vars", "answers.json", "--var", "port=8080");
    expect(r.status, r.stderr).toBe(0);
    expect(read("api/README.md")).toBe("# api\nOwned by core on port 8080.\n");
  });

  it("errors instead of hanging when a required variable is missing", async () => {
    const r = await cli("create", "api", "./service.json");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Missing required variable/);
    expect(r.stderr).toMatch(/owner \(string\): team that owns it/);
    expect(fs.existsSync(path.join(work, "api"))).toBe(false);
  });

  it("--yes never prompts", async () => {
    const r = await cli("create", "api", "./service.json", "--yes");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Missing required variable/);
  });

  it("exits 1 and writes nothing for an invalid value", async () => {
    const r = await cli("create", "My App", "./service.json", "--var", "owner=x");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/projectName.*does not match/);
    expect(fs.existsSync(path.join(work, "My App"))).toBe(false);
  });

  it("refuses --var on a v1 template", async () => {
    fs.writeFileSync(path.join(work, "v1.json"), JSON.stringify({ "a.txt": "a" }));
    const r = await cli("create", "app", "./v1.json", "--var", "x=1");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/v1 template/);
  });
});

describe("save --var", { timeout: 90_000 }, () => {
  it("makes a v2 template that recreates the project under a new name", async () => {
    const src = path.join(work, "my-api");
    fs.mkdirSync(path.join(src, "src"), { recursive: true });
    fs.writeFileSync(path.join(src, "package.json"), '{ "name": "my-api" }\n');
    fs.writeFileSync(path.join(src, "src", "MyApi.ts"), "export const port = 3000;\n");

    const saved = await cli("save", "node-api", "./my-api", "--var", "projectName=my-api", "--var", "port=3000", "--description", "API");
    expect(saved.status, saved.stderr).toBe(0);
    expect(saved.stdout).toMatch(/projectName: 2 in 2 file\(s\) \(my-api x1, MyApi x1\)/);
    expect(saved.stdout).toMatch(/port: 1 in 1 file\(s\)/);

    const tpl = JSON.parse(read("node-api.json"));
    expect(tpl).toMatchObject({ skelpro: 2, name: "node-api", description: "API" });

    const created = await cli("create", "billing", "./node-api.json", "--var", "port=8080");
    expect(created.status, created.stderr).toBe(0);
    expect(read("billing/package.json")).toBe('{ "name": "billing" }\n');
    expect(read("billing/src/Billing.ts")).toBe("export const port = 8080;\n");
  });

  it("warns about values it never found", async () => {
    fs.mkdirSync(path.join(work, "p"));
    fs.writeFileSync(path.join(work, "p", "a.txt"), "hello");
    const r = await cli("save", "t", "./p", "--var", "owner=nobody");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/owner: value "nobody" was not found/);
  });

  it("refuses --description without --var", async () => {
    fs.mkdirSync(path.join(work, "p"));
    fs.writeFileSync(path.join(work, "p", "a.txt"), "hello");
    const r = await cli("save", "t", "./p", "--description", "x");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--description only applies to v2/);
  });
});

describe("agent-ready output", { timeout: 90_000 }, () => {
  it("create writes AGENTS.md, CLAUDE.md and .skelpro.json", async () => {
    fs.writeFileSync(
      path.join(work, "agent.json"),
      JSON.stringify({
        skelpro: 2,
        name: "agent-api",
        files: { tests: {} },
        layout: { tests: { purpose: "Integration tests", required: true } },
        agents: { instructions: "Run npm test.", pointerFiles: ["CLAUDE.md"] },
      }),
    );
    const r = await cli("create", "api", "./agent.json");
    expect(r.status, r.stderr).toBe(0);
    expect(read("api/AGENTS.md")).toBe(
      "# api\n\nRun npm test.\n\n## Project layout\n\n- `tests/`: integration tests (required)\n",
    );
    expect(read("api/CLAUDE.md")).toMatch(/AGENTS\.md/);
    expect(JSON.parse(read("api/.skelpro.json")).template).toEqual({ name: "agent-api", source: "../agent.json" });
  });

  it("info lists the layout and the files generated for agents", async () => {
    fs.writeFileSync(
      path.join(work, "agent.json"),
      JSON.stringify({
        skelpro: 2,
        files: {},
        layout: { tests: { purpose: "Tests", required: true } },
        rules: [{ id: "no-js", forbid: "*.js" }],
        agents: { pointerFiles: ["CLAUDE.md"] },
      }),
    );
    const r = await cli("info", "./agent.json");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Layout \(1\)\n {2}tests\/ {2}Tests {2}\[required\]/);
    expect(r.stdout).toMatch(/no-js {2}forbid \*\.js {2}\[error\]/);
    expect(r.stdout).toMatch(/Generated for agents: AGENTS\.md, CLAUDE\.md, \.skelpro\.json/);
  });
});

describe("info", { timeout: 60_000 }, () => {
  it("prints name, variables and files", async () => {
    const r = await cli("info", "./service.json");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/service \(template v2\)/);
    expect(r.stdout).toMatch(/owner {2}string, required {2}- team that owns it/);
    expect(r.stdout).toMatch(/port {2}number, default 3000/);
    expect(r.stdout).toMatch(/Files \(3\)/);
  });

  it("--json prints only parseable JSON", async () => {
    const r = await cli("info", "./service.json", "--json");
    expect(r.status, r.stderr).toBe(0);
    const info = JSON.parse(r.stdout);
    expect(info.version).toBe(2);
    expect(Object.keys(info.variables)).toEqual(["projectName", "owner", "port", "docker"]);
    expect(info.files).toContain("Dockerfile");
  });
});
