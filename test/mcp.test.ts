import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer } from "../src/mcp/server";

// ---------------------------------------------------------------- fixtures

const svcTemplate = {
  skelpro: 2,
  name: "svc",
  description: "A small HTTP service",
  version: "1.2.0",
  variables: {
    owner: { type: "string", description: "owning team" },
    port: { type: "number", default: 3000 },
  },
  files: {
    "README.md": "# {{projectName}}\nOwned by {{owner}}, port {{port}}.\n",
    src: { "index.ts": "export const port = {{port}};\n" },
    tests: {},
  },
  layout: { tests: { purpose: "Tests", required: true } },
  agents: { instructions: "Run npm test.", pointerFiles: ["CLAUDE.md"] },
};

let root: string; // temp folder holding everything
let cwd: string; // the "repository" the server starts in
let home: string; // fake ~/.skelpro
let httpServer: http.Server;
let baseUrl: string;
const requests: string[] = [];

beforeAll(async () => {
  httpServer = http.createServer((req, res) => {
    requests.push(req.url ?? "");
    if (req.url === "/remote.json") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ skelpro: 2, name: "remote", description: "From the team repo", files: { "a.txt": "a" } }));
    } else if (req.url === "/huge.json") {
      res.end(JSON.stringify({ skelpro: 2, files: { "big.txt": "x".repeat(5000) } }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => httpServer.close(() => resolve())));

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-mcp-")));
  cwd = path.join(root, "repo");
  home = path.join(root, "home");
  fs.mkdirSync(path.join(cwd, ".skelpro", "templates"), { recursive: true });
  fs.mkdirSync(path.join(home, "templates"), { recursive: true });

  const put = (file: string, json: unknown) => fs.writeFileSync(file, JSON.stringify(json));
  put(path.join(cwd, ".skelpro", "templates", "svc.json"), svcTemplate);
  put(path.join(home, "templates", "svc.json"), { skelpro: 2, name: "personal-svc", files: {} }); // shadowed by repo
  put(path.join(home, "templates", "notes.json"), { "notes.md": "# Notes" }); // v1
  fs.writeFileSync(path.join(home, "templates", "broken.json"), "{ nope");
  put(path.join(home, "config.json"), { templates: { remote: `${baseUrl}/remote.json` } });
  requests.length = 0;
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

async function connect(roots: string[] = []) {
  const server = createServer({ cwd, home, roots });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientTransport);
  return {
    async call(name: string, args: Record<string, unknown> = {}) {
      const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> };
      return { isError: Boolean(r.isError), data: JSON.parse(r.content[0].text) };
    },
    close: () => client.close(),
  };
}

const exists = (rel: string) => fs.existsSync(path.join(cwd, rel));

// ---------------------------------------------------------------- tests

describe("tools", () => {
  it("lists the five tools", async () => {
    const server = createServer({ cwd, home });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await server.connect(s);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(c);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "check_structure",
      "describe_template",
      "list_templates",
      "save_template",
      "scaffold_project",
    ]);
    const scaffold = tools.find((t) => t.name === "scaffold_project")!;
    expect(scaffold.description).toMatch(/Prefer this over writing boilerplate files by hand/);
    expect(Object.keys(scaffold.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(["template", "targetDir", "variables", "dryRun", "overwrite"]),
    );
  });
});

describe("list_templates", () => {
  it("lists repo, personal and configured remote templates; the repo copy wins", async () => {
    const s = await connect();
    const { data } = await s.call("list_templates");
    const byName = Object.fromEntries(data.templates.map((t: { name: string }) => [t.name, t]));

    expect(Object.keys(byName).sort()).toEqual(["broken", "notes", "remote", "svc"]);
    expect(byName.svc).toMatchObject({ origin: "repo", description: "A small HTTP service", version: "1.2.0", format: 2 });
    expect(byName.svc.variables.owner).toEqual({ type: "string", description: "owning team" });
    expect(byName.notes).toMatchObject({ origin: "user", format: 1 });
    expect(byName.remote).toMatchObject({ origin: "remote", description: "From the team repo" });
    expect(byName.broken.error.code).toBe("invalid_template");
  });

  it("filters by query", async () => {
    const s = await connect();
    const { data } = await s.call("list_templates", { query: "http" });
    expect(data.templates.map((t: { name: string }) => t.name)).toEqual(["svc"]);
  });
});

describe("describe_template", () => {
  it("returns variables, files, layout and the generated conventions", async () => {
    const s = await connect();
    const { isError, data } = await s.call("describe_template", { template: "svc" });
    expect(isError).toBe(false);
    expect(data).toMatchObject({
      name: "svc",
      origin: "repo",
      format: 2,
      version: "1.2.0",
      variables: svcTemplate.variables,
      layout: svcTemplate.layout,
      agents: svcTemplate.agents,
    });
    expect(data.files.sort()).toEqual(["README.md", "src/index.ts"]);
  });

  it("an unknown name is a structured error listing what exists", async () => {
    const s = await connect();
    const { isError, data } = await s.call("describe_template", { template: "nope" });
    expect(isError).toBe(true);
    expect(data.error.code).toBe("template_not_found");
    expect(data.error.fix).toMatch(/broken, notes, remote, svc/);
  });

  it("never fetches a URL an agent sends as the template name", async () => {
    const s = await connect();
    const { data } = await s.call("describe_template", { template: `${baseUrl}/evil.json` });
    expect(data.error.code).toBe("template_not_found");
    expect(requests).not.toContain("/evil.json");
  });
});

describe("scaffold_project", () => {
  it("is a dry run by default: returns the plan, writes nothing", async () => {
    const s = await connect();
    const { isError, data } = await s.call("scaffold_project", {
      template: "svc",
      targetDir: "billing",
      variables: { owner: "payments" },
    });
    expect(isError).toBe(false);
    expect(data).toMatchObject({ targetDir: "billing", dryRun: true, written: false, conflicts: [] });
    expect(data.files.sort()).toEqual([".skelpro.json", "AGENTS.md", "CLAUDE.md", "README.md", "src/index.ts"]);
    expect(data.agentsMd).toContain("Run npm test.");
    expect(data.nextStep).toMatch(/dryRun: false/);
    expect(exists("billing")).toBe(false);
  });

  it("writes with dryRun: false", async () => {
    const s = await connect();
    const { data } = await s.call("scaffold_project", {
      template: "svc",
      targetDir: "billing",
      variables: { owner: "payments", port: 8080 },
      dryRun: false,
    });
    expect(data.written).toBe(true);
    expect(fs.readFileSync(path.join(cwd, "billing", "README.md"), "utf8")).toBe("# billing\nOwned by payments, port 8080.\n");
    expect(exists("billing/tests")).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(cwd, "billing", ".skelpro.json"), "utf8")).template.name).toBe("svc");
    expect(data.nextStep).toMatch(/Read AGENTS.md/);
  });

  it("missing variables come back with what's needed", async () => {
    const s = await connect();
    const { isError, data } = await s.call("scaffold_project", { template: "svc", targetDir: "x" });
    expect(isError).toBe(true);
    expect(data.error.code).toBe("missing_variable");
    expect(data.error.details).toEqual([{ variable: "owner", type: "string", description: "owning team" }]);
    expect(data.error.fix).toMatch(/describe_template/);
  });

  it("invalid variable values are refused", async () => {
    const s = await connect();
    const { data } = await s.call("scaffold_project", {
      template: "svc",
      targetDir: "x",
      variables: { owner: "a", port: "eighty" },
    });
    expect(data.error.code).toBe("invalid_variable");
  });

  it("a configured remote template works", async () => {
    const s = await connect();
    const { data } = await s.call("scaffold_project", { template: "remote", targetDir: "r", dryRun: false });
    expect(data.written).toBe(true);
    expect(fs.readFileSync(path.join(cwd, "r", "a.txt"), "utf8")).toBe("a");
    expect(requests).toEqual(["/remote.json"]);
  });
});

describe("safety", () => {
  it.each(["../outside", "../../tmp/outside"])("refuses targetDir %s outside the allowed roots", async (targetDir) => {
    const s = await connect();
    const { isError, data } = await s.call("scaffold_project", {
      template: "notes",
      targetDir,
      dryRun: false,
    });
    expect(isError).toBe(true);
    expect(data.error.code).toBe("outside_allowed_roots");
    expect(data.error.fix).toMatch(/--root/);
    expect(fs.existsSync(path.join(root, "outside"))).toBe(false);
  });

  it("refuses an absolute targetDir elsewhere, but allows it with --root", async () => {
    const other = path.join(root, "other");
    const denied = await (await connect()).call("scaffold_project", { template: "notes", targetDir: other, dryRun: false });
    expect(denied.data.error.code).toBe("outside_allowed_roots");

    const allowed = await (await connect([other])).call("scaffold_project", {
      template: "notes",
      targetDir: path.join(other, "proj"),
      dryRun: false,
    });
    expect(allowed.isError).toBe(false);
    expect(fs.existsSync(path.join(other, "proj", "notes.md"))).toBe(true);
  });

  it("refuses a symlink inside the root that leads outside it", async () => {
    const outside = path.join(root, "outside");
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(cwd, "link"), process.platform === "win32" ? "junction" : "dir");
    const { data } = await (await connect()).call("scaffold_project", {
      template: "notes",
      targetDir: "link/proj",
      dryRun: false,
    });
    expect(data.error.code).toBe("outside_allowed_roots");
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it("lists conflicts in a dry run and never overwrites without overwrite: true", async () => {
    fs.mkdirSync(path.join(cwd, "proj"));
    fs.writeFileSync(path.join(cwd, "proj", "notes.md"), "mine");
    const s = await connect();

    const plan = await s.call("scaffold_project", { template: "notes", targetDir: "proj" });
    expect(plan.data.conflicts).toEqual(["notes.md"]);
    expect(plan.data.nextStep).toMatch(/already exist/);

    const refused = await s.call("scaffold_project", { template: "notes", targetDir: "proj", dryRun: false });
    expect(refused.data.error.code).toBe("conflicts");
    expect(refused.data.error.details).toEqual({ conflicts: ["notes.md"] });
    expect(fs.readFileSync(path.join(cwd, "proj", "notes.md"), "utf8")).toBe("mine");

    const replaced = await s.call("scaffold_project", { template: "notes", targetDir: "proj", dryRun: false, overwrite: true });
    expect(replaced.data.written).toBe(true);
    expect(fs.readFileSync(path.join(cwd, "proj", "notes.md"), "utf8")).toBe("# Notes");
  });

  it("enforces the file-count limit from config", async () => {
    fs.writeFileSync(path.join(home, "config.json"), JSON.stringify({ limits: { maxFiles: 1 } }));
    const { data } = await (await connect()).call("scaffold_project", {
      template: "svc",
      targetDir: "x",
      variables: { owner: "a" },
    });
    expect(data.error.code).toBe("limit_exceeded");
    expect(data.error.message).toMatch(/limit is 1/);
  });

  it("enforces the size limit on remote templates", async () => {
    fs.writeFileSync(
      path.join(home, "config.json"),
      JSON.stringify({ templates: { huge: `${baseUrl}/huge.json` }, limits: { maxBytes: 1000 } }),
    );
    const { data } = await (await connect()).call("describe_template", { template: "huge" });
    expect(data.error.code).toBe("limit_exceeded");
  });

  it("a template path can't escape the project, even via variables", async () => {
    fs.writeFileSync(
      path.join(cwd, ".skelpro", "templates", "evil.json"),
      JSON.stringify({ skelpro: 2, variables: { dir: { type: "string" } }, files: { "{{dir}}": { "x.txt": "pwned" } } }),
    );
    const { data } = await (await connect()).call("scaffold_project", {
      template: "evil",
      targetDir: "proj",
      variables: { dir: "../../escaped" },
      dryRun: false,
    });
    expect(data.error.code).toBe("unsafe_path");
    expect(fs.existsSync(path.join(root, "escaped"))).toBe(false);
  });
});

describe("check_structure", () => {
  it("checks a scaffolded project against its .skelpro.json", async () => {
    const s = await connect();
    await s.call("scaffold_project", { template: "svc", targetDir: "billing", variables: { owner: "p" }, dryRun: false });

    const clean = await s.call("check_structure", { projectDir: "billing" });
    expect(clean.isError).toBe(false);
    expect(clean.data).toMatchObject({ projectDir: "billing", passed: true, counts: { error: 0 } });

    fs.rmSync(path.join(cwd, "billing", "tests"), { recursive: true });
    const broken = await s.call("check_structure", { projectDir: "billing" });
    expect(broken.data.passed).toBe(false);
    expect(broken.data.findings).toContainEqual(
      expect.objectContaining({ rule: "required", path: "tests/", severity: "error" }),
    );
    expect(broken.data.nextStep).toMatch(/Fix the errors/);
  });

  it("checks against a named template", async () => {
    fs.mkdirSync(path.join(cwd, "plain", "src"), { recursive: true });
    const { data } = await (await connect()).call("check_structure", {
      projectDir: "plain",
      template: "svc",
      variables: { owner: "x" },
    });
    expect(data.findings.map((f: { rule: string }) => f.rule)).toContain("required");
  });

  it("explains how to proceed when there's no .skelpro.json", async () => {
    fs.mkdirSync(path.join(cwd, "plain"));
    const { isError, data } = await (await connect()).call("check_structure", { projectDir: "plain" });
    expect(isError).toBe(true);
    expect(data.error.code).toBe("not_found");
    expect(data.error.fix).toMatch(/init-agents/);
  });

  it("refuses to read outside the allowed roots", async () => {
    const { data } = await (await connect()).call("check_structure", { projectDir: ".." });
    expect(data.error.code).toBe("outside_allowed_roots");
  });
});

describe("save_template", () => {
  beforeEach(() => {
    const write = (rel: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
      fs.writeFileSync(path.join(cwd, rel), content);
    };
    write("my-api/package.json", '{ "name": "my-api" }\n');
    write("my-api/src/MyApi.ts", "export class MyApi {}\n");
    write("my-api/.env", "SECRET=1\n");
    write("my-api/node_modules/x/index.js", "");
    write("my-api/docs/notes.md", "");
  });

  it("saves into the repo's .skelpro/templates with variables, and lists what it skipped", async () => {
    const s = await connect();
    const { isError, data } = await s.call("save_template", {
      sourceDir: "my-api",
      name: "api",
      variables: { projectName: "my-api" },
      description: "An API",
      exclude: ["docs/**"],
    });
    expect(isError).toBe(false);
    expect(data).toMatchObject({ templatePath: path.join(".skelpro", "templates", "api.json"), format: 2 });
    expect(data.skipped).toEqual(
      expect.arrayContaining([
        { path: ".env", reason: expect.stringMatching(/ignored/) },
        { path: "node_modules/", reason: expect.stringMatching(/ignored/) },
        { path: "docs/notes.md", reason: "matches exclude" },
      ]),
    );
    expect(data.replacements[0]).toMatchObject({ variable: "projectName", total: 3 });

    // ...and it's immediately usable.
    const listed = await s.call("list_templates", { query: "An API" });
    expect(listed.data.templates.map((t: { name: string }) => t.name)).toEqual(["api"]);
    const made = await s.call("scaffold_project", { template: "api", targetDir: "orders", dryRun: false });
    expect(fs.existsSync(path.join(cwd, "orders", "src", "Orders.ts"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, "orders", ".env"))).toBe(false);
    expect(made.data.written).toBe(true);
  });

  it("won't replace an existing template unless asked", async () => {
    const s = await connect();
    const { data } = await s.call("save_template", { sourceDir: "my-api", name: "svc" });
    expect(data.error.code).toBe("conflicts");
    const replaced = await s.call("save_template", { sourceDir: "my-api", name: "svc", overwrite: true });
    expect(replaced.data.format).toBe(1);
  });

  it.each([
    [{ sourceDir: "..", name: "x" }, "outside_allowed_roots"],
    [{ sourceDir: "my-api", name: "../evil" }, "invalid_input"],
    [{ sourceDir: "nope", name: "x" }, "not_found"],
    [{ sourceDir: "my-api", name: "x", description: "no vars" }, "invalid_input"],
    [{ sourceDir: "my-api", name: "x", variables: { flag: "true" } }, "invalid_input"],
  ])("refuses %j (%s)", async (args, code) => {
    const { isError, data } = await (await connect()).call("save_template", args);
    expect(isError).toBe(true);
    expect(data.error.code).toBe(code);
  });
});

describe("skelpro mcp --print-config", { timeout: 60_000 }, () => {
  it("prints the client config snippet", async () => {
    const { runCli } = await import("./helpers/run-cli");
    const r = await runCli(cwd, ["mcp", "--print-config"]);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      mcpServers: { skelpro: { command: "npx", args: ["-y", "skelpro", "mcp"] } },
    });
  });
});
