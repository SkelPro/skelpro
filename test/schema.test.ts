import fs from "fs";
import path from "path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

import { reverseTemplate } from "../src/template/reverse";
import { parseTemplate } from "../src/template/render";

const ROOT = path.resolve(__dirname, "..");
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "schema", "template-v2.json"), "utf8"));

const ajv = new Ajv2020({
  allErrors: true,
  formats: {
    regex: (s: string) => {
      try {
        new RegExp(s);
        return true;
      } catch {
        return false;
      }
    },
  },
});
const validate = ajv.compile(schema);

const errors = () => ajv.errorsText(validate.errors);

/** The full example from docs/templates.md. */
function docsExample(): unknown {
  const md = fs.readFileSync(path.join(ROOT, "docs", "templates.md"), "utf8").replace(/\r\n/g, "\n"); // Windows checkouts may use CRLF
  const block = /## A complete v2 example\s+```json\n([\s\S]*?)```/.exec(md);
  return JSON.parse(block![1]);
}

describe("schema/template-v2.json", () => {
  it("accepts the example in docs/templates.md", () => {
    expect(validate(docsExample()), errors()).toBe(true);
  });

  it("accepts the agent-ready example in docs/templates.md", () => {
    const md = fs.readFileSync(path.join(ROOT, "docs", "templates.md"), "utf8").replace(/\r\n/g, "\n"); // Windows checkouts may use CRLF
    const section = md.slice(md.indexOf("## Agent-ready templates"));
    const example = JSON.parse(/```json\n([\s\S]*?)```/.exec(section)![1]);
    expect(validate(example), errors()).toBe(true);
    expect(() => parseTemplate(example)).not.toThrow();
  });

  it.each([
    ["layout entry without purpose", { skelpro: 2, files: {}, layout: { src: {} } }],
    ["bad naming style", { skelpro: 2, files: {}, layout: { src: { purpose: "x", naming: "Title" } } }],
    ["layout path with ..", { skelpro: 2, files: {}, layout: { "../x": { purpose: "x" } } }],
    ["rule with both kinds", { skelpro: 2, files: {}, rules: [{ id: "a", forbid: "x", match: "y", expect: "z" }] }],
    ["rule without id", { skelpro: 2, files: {}, rules: [{ forbid: "x" }] }],
    ["pointer to AGENTS.md", { skelpro: 2, files: {}, agents: { pointerFiles: ["AGENTS.md"] } }],
    ["unknown agents field", { skelpro: 2, files: {}, agents: { run: "x" } }],
  ])("rejects %s", (_label, template) => {
    expect(validate(template)).toBe(false);
  });

  it("agrees with the renderer on the docs example", () => {
    expect(() => parseTemplate(docsExample())).not.toThrow();
  });

  it("accepts what save --var produces", () => {
    const { template } = reverseTemplate(
      { "package.json": '{"name":"my-api"}', src: { "MyApi.ts": "3000" }, "App.vue": "{{ x }}" },
      { name: "node-api", description: "API", vars: { projectName: "my-api", port: "3000" } },
    );
    expect(validate(JSON.parse(JSON.stringify(template))), errors()).toBe(true);
  });

  it.each([
    ["missing skelpro", { files: {} }],
    ["wrong version", { skelpro: 1, files: {} }],
    ["missing files", { skelpro: 2 }],
    ["unknown envelope key", { skelpro: 2, files: {}, hooks: { post: "rm -rf /" } }],
    ["unknown variable type", { skelpro: 2, variables: { a: { type: "date" } }, files: {} }],
    ["enum without options", { skelpro: 2, variables: { a: { type: "enum" } }, files: {} }],
    ["pattern on a number", { skelpro: 2, variables: { a: { type: "number", pattern: "x" } }, files: {} }],
    ["number with string default", { skelpro: 2, variables: { a: { type: "number", default: "x" } }, files: {} }],
    ["invalid regex", { skelpro: 2, variables: { a: { type: "string", pattern: "(" } }, files: {} }],
    ["bad variable name", { skelpro: 2, variables: { "my-var": { type: "string" } }, files: {} }],
    ["reserved $ key", { skelpro: 2, files: { $run: "x" } }],
    ["$when with &&", { skelpro: 2, files: { d: { $when: "a && b", f: "" } } }],
    ["conditional file with extra keys", { skelpro: 2, files: { f: { $content: "", mode: "755" } } }],
    ["parent traversal", { skelpro: 2, files: { "../x": "" } }],
    ["nested traversal", { skelpro: 2, files: { src: { "a/../../x": "" } } }],
    ["absolute path", { skelpro: 2, files: { "/etc/x": "" } }],
    ["drive path", { skelpro: 2, files: { "C:x": "" } }],
    ["non-string file", { skelpro: 2, files: { a: 1 } }],
  ])("rejects %s", (_label, template) => {
    expect(validate(template)).toBe(false);
  });

  it("allows names that only start with dots, and nested paths", () => {
    expect(validate({ skelpro: 2, files: { "..config": "", ".github/workflows": { "ci.yml": "" } } }), errors()).toBe(true);
  });
});
