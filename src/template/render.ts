/**
 * Template format v1/v2: parsing, validation, variable resolution and
 * rendering. Pure functions with no console output or prompts, so the CLI
 * and (later) the MCP server can share them.
 */
import type { JsonStructure } from "../types/structures";
import { decodeBinary } from "../utils/files";

// ---------------------------------------------------------------- types

export type VariableType = "string" | "number" | "boolean" | "enum";
export type VariableValue = string | number | boolean;
export type Variables = Record<string, VariableValue>;

export interface VariableDef {
  type: VariableType;
  description?: string;
  default?: VariableValue;
  /** Regex the value must match (strings only). */
  pattern?: string;
  /** Allowed values (enums only). */
  options?: string[];
}

/** A file whose presence depends on a condition. */
export interface ConditionalFile {
  $when?: string;
  $content: string;
}

export interface FileTree {
  [name: string]: string | ConditionalFile | FileTree;
}

export interface ParsedTemplate {
  version: 1 | 2;
  name?: string;
  description?: string;
  variables: Record<string, VariableDef>;
  files: FileTree;
  /** v1 `worktree: true` flag, or the v2 envelope field. */
  worktree: boolean;
  /** The raw v2 envelope, for fields later features read (layout, rules, agents). */
  raw: Record<string, unknown>;
}

export type TemplateErrorCode =
  | "invalid_template"
  | "missing_variable"
  | "invalid_variable"
  | "unknown_variable";

export interface TemplateErrorDetail {
  variable?: string;
  type?: VariableType;
  pattern?: string;
  options?: string[];
  description?: string;
}

/**
 * Error with a machine-readable code and, for variable problems, enough
 * detail for a caller (human or agent) to fix the input and retry.
 */
export class TemplateError extends Error {
  constructor(
    public code: TemplateErrorCode,
    message: string,
    public details: TemplateErrorDetail[] = [],
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

// ---------------------------------------------------------------- built-ins

export const BUILTIN_VARIABLES = ["projectName", "year", "date"] as const;

export function builtinValues(projectName: string, now = new Date()): Variables {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    projectName,
    year: now.getFullYear(),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
}

// ---------------------------------------------------------------- case helpers

function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export const CASE_HELPERS: Record<string, (value: string) => string> = {
  kebab: (v) => words(v).join("-"),
  snake: (v) => words(v).join("_"),
  camel: (v) => words(v).map((w, i) => (i === 0 ? w : capitalize(w))).join(""),
  pascal: (v) => words(v).map(capitalize).join(""),
  /** CONSTANT_CASE: my-api → MY_API */
  upper: (v) => words(v).join("_").toUpperCase(),
};

// ---------------------------------------------------------------- placeholders

// `\{{` is an escaped literal `{{`; otherwise `{{ name }}` or `{{ helper name }}`.
const PLACEHOLDER = /\\\{\{|\{\{\s*([^{}]*?)\s*\}\}/g;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface Placeholder {
  helper?: string;
  name: string;
}

function parsePlaceholder(inner: string, where: string): Placeholder {
  const parts = inner.split(/\s+/).filter(Boolean);
  if (parts.length === 1 && IDENT.test(parts[0])) {
    return { name: parts[0] };
  }
  if (parts.length === 2 && IDENT.test(parts[1])) {
    if (!CASE_HELPERS[parts[0]]) {
      throw new TemplateError(
        "invalid_template",
        `Unknown helper "${parts[0]}" in {{${inner}}} (${where}). ` +
          `Available: ${Object.keys(CASE_HELPERS).join(", ")}.`,
      );
    }
    return { helper: parts[0], name: parts[1] };
  }
  throw new TemplateError(
    "invalid_template",
    `Invalid placeholder {{${inner}}} (${where}). Use {{name}} or {{helper name}}; ` +
      `write \\{{ for a literal {{.`,
  );
}

/** Every variable name a string refers to. */
export function placeholdersIn(text: string, where = "template"): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (match[0] === "\\{{") continue;
    names.push(parsePlaceholder(match[1], where).name);
  }
  return names;
}

export function renderString(text: string, vars: Variables, where = "template"): string {
  return text.replace(PLACEHOLDER, (whole, inner: string) => {
    if (whole === "\\{{") return "{{";
    const { helper, name } = parsePlaceholder(inner, where);
    if (!(name in vars)) {
      throw new TemplateError(
        "invalid_template",
        `Undefined variable "${name}" in ${where}.`,
      );
    }
    const value = String(vars[name]);
    return helper ? CASE_HELPERS[helper](value) : value;
  });
}

// ---------------------------------------------------------------- conditions

const CONDITION =
  /^\s*(!?)\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:(==|!=)\s*(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?|true|false)))?\s*$/;

interface Condition {
  negate: boolean;
  name: string;
  op?: "==" | "!=";
  literal?: string;
}

function parseCondition(expr: string, where: string): Condition {
  const m = typeof expr === "string" ? CONDITION.exec(expr) : null;
  if (!m || (m[1] && m[3])) {
    throw new TemplateError(
      "invalid_template",
      `Invalid $when "${expr}" (${where}). Use name, !name, name == 'value' or name != 'value'.`,
    );
  }
  return {
    negate: m[1] === "!",
    name: m[2],
    op: m[3] as Condition["op"],
    literal: m[4] ?? m[5] ?? m[6],
  };
}

export function evaluateCondition(expr: string, vars: Variables, where = "template"): boolean {
  const c = parseCondition(expr, where);
  if (!(c.name in vars)) {
    throw new TemplateError("invalid_template", `Undefined variable "${c.name}" in $when (${where}).`);
  }
  const value = vars[c.name];
  if (c.op) {
    const equal = String(value) === c.literal;
    return c.op === "==" ? equal : !equal;
  }
  const truthy = Boolean(value);
  return c.negate ? !truthy : truthy;
}

// ---------------------------------------------------------------- parsing

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const VARIABLE_TYPES: VariableType[] = ["string", "number", "boolean", "enum"];

function validateVariableDef(name: string, def: unknown): VariableDef {
  const bad = (msg: string) =>
    new TemplateError("invalid_template", `Variable "${name}": ${msg}`);

  if (!IDENT.test(name)) throw bad("names must be letters, digits and _, not starting with a digit.");
  if (!isPlainObject(def)) throw bad("definition must be an object.");

  const type = def.type as VariableType;
  if (!VARIABLE_TYPES.includes(type)) {
    throw bad(`type must be one of ${VARIABLE_TYPES.join(", ")}.`);
  }
  if (type === "enum") {
    if (!Array.isArray(def.options) || !def.options.length || !def.options.every((o) => typeof o === "string")) {
      throw bad("enum variables need a non-empty \"options\" list of strings.");
    }
  }
  if (def.pattern !== undefined) {
    if (type !== "string" || typeof def.pattern !== "string") throw bad("\"pattern\" is only allowed on string variables.");
    try {
      new RegExp(def.pattern);
    } catch {
      throw bad(`"pattern" is not a valid regular expression.`);
    }
  }

  const parsed = def as unknown as VariableDef;
  if (parsed.default !== undefined) {
    // The default must itself be a valid value.
    coerceValue(name, parsed, parsed.default);
  }
  return parsed;
}

/** Reads a v1 or v2 template object. Throws TemplateError if malformed. */
export function parseTemplate(json: unknown): ParsedTemplate {
  if (!isPlainObject(json)) {
    throw new TemplateError("invalid_template", "Template must be a JSON object.");
  }

  if (!("skelpro" in json)) {
    // v1: the whole object is the file tree, plus an optional worktree flag.
    const { worktree, ...rest } = json;
    const files: FileTree = {};
    for (const [key, value] of Object.entries(rest)) {
      if (typeof value === "string" || isPlainObject(value)) files[key] = value as FileTree[string];
    }
    if (worktree !== true && isPlainObject(worktree)) files.worktree = worktree as FileTree;
    return { version: 1, variables: {}, files, worktree: worktree === true, raw: json };
  }

  if (json.skelpro !== 2) {
    throw new TemplateError(
      "invalid_template",
      `Unsupported template version ${JSON.stringify(json.skelpro)}; this SkelPro reads versions 1 and 2.`,
    );
  }
  if (!isPlainObject(json.files)) {
    throw new TemplateError("invalid_template", 'A v2 template needs a "files" object.');
  }
  if (json.variables !== undefined && !isPlainObject(json.variables)) {
    throw new TemplateError("invalid_template", '"variables" must be an object.');
  }

  const variables: Record<string, VariableDef> = {};
  for (const [name, def] of Object.entries(json.variables ?? {})) {
    variables[name] = validateVariableDef(name, def);
  }

  const template: ParsedTemplate = {
    version: 2,
    name: typeof json.name === "string" ? json.name : undefined,
    description: typeof json.description === "string" ? json.description : undefined,
    variables,
    files: json.files as FileTree,
    worktree: json.worktree === true,
    raw: json,
  };

  checkReferences(template);
  return template;
}

/**
 * Walks the file tree once, checking structure and that every placeholder
 * and $when refers to a declared variable or a built-in. Runs before any
 * prompting, so a broken template fails fast.
 */
function checkReferences(template: ParsedTemplate): void {
  const known = new Set<string>([...BUILTIN_VARIABLES, ...Object.keys(template.variables)]);
  const check = (names: string[], where: string) => {
    for (const name of names) {
      if (!known.has(name)) {
        throw new TemplateError(
          "invalid_template",
          `Undefined variable "${name}" in ${where}. Declare it under "variables".`,
        );
      }
    }
  };

  const walk = (tree: FileTree, prefix: string) => {
    for (const [key, value] of Object.entries(tree)) {
      if (key === "$when") continue;
      const where = prefix ? `${prefix}/${key}` : key;
      if (key.startsWith("$")) {
        throw new TemplateError("invalid_template", `Unknown key "${key}" at ${prefix || "files"}.`);
      }
      check(placeholdersIn(key, `the name "${where}"`), `the name "${where}"`);

      if (typeof value === "string") {
        if (!decodeBinary(value)) check(placeholdersIn(value, where), where);
      } else if (isPlainObject(value) && "$content" in value) {
        const extra = Object.keys(value).filter((k) => k !== "$content" && k !== "$when");
        if (extra.length || typeof value.$content !== "string") {
          throw new TemplateError(
            "invalid_template",
            `${where}: a conditional file has only "$when" and a string "$content".`,
          );
        }
        if (value.$when !== undefined) check([parseCondition(value.$when as string, where).name], `$when at ${where}`);
        if (!decodeBinary(value.$content as string)) check(placeholdersIn(value.$content as string, where), where);
      } else if (isPlainObject(value)) {
        if (value.$when !== undefined) check([parseCondition(value.$when as string, where).name], `$when at ${where}`);
        walk(value as FileTree, where);
      } else {
        throw new TemplateError("invalid_template", `${where}: expected a string or an object.`);
      }
    }
  };

  walk(template.files, "");
}

// ---------------------------------------------------------------- variables

function coerceValue(name: string, def: VariableDef, raw: unknown): VariableValue {
  const invalid = (why: string) =>
    new TemplateError("invalid_variable", `Invalid value for ${name}: ${why}`, [
      { variable: name, type: def.type, pattern: def.pattern, options: def.options, description: def.description },
    ]);

  switch (def.type) {
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) throw invalid(`expected a number, got ${JSON.stringify(raw)}.`);
      return n;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      const s = String(raw).trim().toLowerCase();
      if (["true", "yes", "y", "1"].includes(s)) return true;
      if (["false", "no", "n", "0"].includes(s)) return false;
      throw invalid(`expected true or false, got ${JSON.stringify(raw)}.`);
    }
    case "enum": {
      const s = String(raw);
      if (!def.options!.includes(s)) throw invalid(`expected one of ${def.options!.join(", ")}, got ${JSON.stringify(raw)}.`);
      return s;
    }
    default: {
      if (typeof raw !== "string" && typeof raw !== "number") throw invalid(`expected text, got ${JSON.stringify(raw)}.`);
      const s = String(raw);
      if (def.pattern && !new RegExp(def.pattern).test(s)) {
        throw invalid(`${JSON.stringify(s)} does not match ${def.pattern}.`);
      }
      return s;
    }
  }
}

export interface ResolveOptions {
  /** CLI project name; the default for a declared `projectName`. */
  projectName: string;
  /** Values supplied by the caller (--vars file, then --var flags). */
  provided?: Record<string, unknown>;
  /**
   * Called with the variables that still have no value. Return answers for
   * them, or omit it to make missing variables an error (agents, CI, --yes).
   */
  ask?: (missing: Array<[string, VariableDef]>) => Promise<Record<string, unknown>>;
  now?: Date;
}

/** Combines built-ins, defaults, provided values and answers; validates all of it. */
export async function resolveVariables(
  template: ParsedTemplate,
  options: ResolveOptions,
): Promise<Variables> {
  const provided = options.provided ?? {};
  const defs = template.variables;

  const unknown = Object.keys(provided).filter((k) => !(k in defs));
  if (unknown.length) {
    const declared = Object.keys(defs);
    throw new TemplateError(
      "unknown_variable",
      `Unknown variable${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. ` +
        (declared.length ? `This template declares: ${declared.join(", ")}.` : "This template declares no variables."),
      unknown.map((variable) => ({ variable })),
    );
  }

  const vars: Variables = builtinValues(options.projectName, options.now);
  const missing: Array<[string, VariableDef]> = [];

  for (const [name, def] of Object.entries(defs)) {
    if (name in provided) {
      vars[name] = coerceValue(name, def, provided[name]);
    } else if (name === "projectName") {
      vars[name] = coerceValue(name, def, options.projectName);
    } else if (def.default !== undefined) {
      vars[name] = coerceValue(name, def, def.default);
    } else {
      missing.push([name, def]);
    }
  }

  if (missing.length && options.ask) {
    const answers = await options.ask(missing);
    for (const [name, def] of missing) {
      if (name in answers) vars[name] = coerceValue(name, def, answers[name]);
    }
  }

  const stillMissing = missing.filter(([name]) => !(name in vars));
  if (stillMissing.length) {
    const describe = ([name, def]: [string, VariableDef]) =>
      `${name} (${def.type}${def.pattern ? `, pattern ${def.pattern}` : ""}` +
      `${def.options ? `, one of ${def.options.join("|")}` : ""})` +
      `${def.description ? `: ${def.description}` : ""}`;
    throw new TemplateError(
      "missing_variable",
      `Missing required variable${stillMissing.length > 1 ? "s" : ""}:\n  ` +
        stillMissing.map(describe).join("\n  ") +
        `\nPass them with --var name=value or --vars file.json.`,
      stillMissing.map(([variable, def]) => ({
        variable,
        type: def.type,
        pattern: def.pattern,
        options: def.options,
        description: def.description,
      })),
    );
  }

  return vars;
}

// ---------------------------------------------------------------- rendering

/**
 * Produces a plain file tree (the v1 shape scaffoldJSON writes) with names
 * and contents rendered and $when applied. v1 templates pass through
 * untouched. Paths are not checked here: scaffoldJSON runs every rendered
 * path through safeJoin, so a variable value like ../../x cannot escape.
 */
export function renderTemplate(template: ParsedTemplate, vars: Variables): JsonStructure {
  if (template.version === 1) return template.files as JsonStructure;

  const renderTree = (tree: FileTree, prefix: string): JsonStructure => {
    const out: JsonStructure = {};
    const sources: Record<string, string> = {};

    for (const [key, value] of Object.entries(tree)) {
      if (key === "$when") continue;
      const where = prefix ? `${prefix}/${key}` : key;
      const name = renderString(key, vars, `the name "${where}"`);

      if (!name.trim()) {
        throw new TemplateError("invalid_template", `The name "${where}" renders to an empty string.`);
      }

      let rendered: JsonStructure[string] | undefined;
      if (typeof value === "string") {
        rendered = decodeBinary(value) ? value : renderString(value, vars, where);
      } else if ("$content" in value) {
        const file = value as ConditionalFile;
        if (file.$when === undefined || evaluateCondition(file.$when, vars, where)) {
          rendered = decodeBinary(file.$content) ? file.$content : renderString(file.$content, vars, where);
        }
      } else {
        const folder = value as FileTree;
        const when = folder.$when as unknown as string | undefined;
        if (when === undefined || evaluateCondition(when, vars, where)) {
          rendered = renderTree(folder, where);
        }
      }

      if (rendered === undefined) continue;
      if (name in out) {
        throw new TemplateError(
          "invalid_template",
          `"${sources[name]}" and "${where}" both render to "${name}".`,
        );
      }
      out[name] = rendered;
      sources[name] = where;
    }
    return out;
  };

  return renderTree(template.files, "");
}

/** Every file path in a rendered or raw tree (for `info` and dry runs). */
export function listPaths(tree: FileTree | JsonStructure, prefix = ""): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    if (key === "$when") continue;
    const p = prefix ? `${prefix}/${key}` : key;
    if (typeof value === "string" || (isPlainObject(value) && "$content" in value)) {
      paths.push(p);
    } else if (isPlainObject(value)) {
      paths.push(...listPaths(value as FileTree, p));
    }
  }
  return paths;
}
