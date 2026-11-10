/**
 * Reverse substitution for `save --var`: turns a real project into a v2
 * template by replacing the given values (and their case variants) with
 * {{placeholders}}. Pure: takes the tree createJSON produced, returns the
 * template plus a summary of every replacement for the author to review.
 */
import type { JsonStructure } from "../types/structures";
import { decodeBinary } from "../utils/files";
import { CASE_HELPERS, type VariableDef } from "./render";

export const TEMPLATE_SCHEMA_URL =
  "https://raw.githubusercontent.com/SkelPro/skelpro/main/schema/template-v2.json";

export interface ReverseOptions {
  name: string;
  description?: string;
  /** name → the literal value as it appears in the project. */
  vars: Record<string, string>;
}

export interface ReplacementSummary {
  variable: string;
  /** e.g. { "my-api": 10, "MyApi": 4 } */
  byVariant: Record<string, number>;
  total: number;
  /** Relative paths of files whose name or content changed. */
  files: string[];
}

export interface ReverseResult {
  template: Record<string, unknown>;
  summary: ReplacementSummary[];
  /** Variables whose value was never found. */
  unused: string[];
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Variant {
  variable: string;
  text: string;
  placeholder: string;
  numeric: boolean;
}

/** The value itself, then each case helper's version of it, deduplicated. */
function variantsFor(variable: string, value: string): Variant[] {
  if (NUMBER.test(value)) {
    return [{ variable, text: value, placeholder: `{{${variable}}}`, numeric: true }];
  }

  const seen = new Set<string>();
  const out: Variant[] = [];
  const add = (text: string, placeholder: string) => {
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push({ variable, text, placeholder, numeric: false });
    }
  };

  add(value, `{{${variable}}}`);
  for (const helper of ["kebab", "snake", "camel", "pascal", "upper"]) {
    add(CASE_HELPERS[helper](value), `{{${helper} ${variable}}}`);
  }
  return out;
}

function validate(vars: Record<string, string>): void {
  const entries = Object.entries(vars);
  if (!entries.length) throw new Error("save --var needs at least one name=value pair.");

  const byValue = new Map<string, string>();
  for (const [name, value] of entries) {
    if (!IDENT.test(name)) {
      throw new Error(`Invalid variable name "${name}": use letters, digits and _.`);
    }
    if (name === "year" || name === "date") {
      throw new Error(`"${name}" is a built-in variable and is always available; pick another name.`);
    }
    if (!value) throw new Error(`--var ${name} needs a value to look for.`);
    if (/^(true|false)$/i.test(value)) {
      throw new Error(
        `--var ${name}=${value}: booleans can't be substituted (every "${value}" in the project ` +
          `would change). Add a boolean variable and $when blocks to the template by hand.`,
      );
    }
    const other = byValue.get(value.toLowerCase());
    if (other) {
      throw new Error(`--var ${other} and --var ${name} have the same value "${value}"; give each a distinct value.`);
    }
    byValue.set(value.toLowerCase(), name);
  }
}

/** Escapes literal {{ so the renderer outputs it unchanged. */
const escapeBraces = (text: string) => text.replace(/\{\{/g, "\\{{");

export function reverseTemplate(tree: JsonStructure, options: ReverseOptions): ReverseResult {
  validate(options.vars);

  const variants = Object.entries(options.vars)
    .flatMap(([name, value]) => variantsFor(name, value))
    // Longest first, so "MyApiClient" wins over "MyApi" in the alternation.
    .sort((a, b) => b.text.length - a.text.length);

  const byText = new Map(variants.map((v) => [v.text, v]));
  const alternation = variants
    // Numbers match whole numbers only: not 30001, v1.3000 or 3000.5, but
    // still "port 3000." at the end of a sentence.
    .map((v) =>
      v.numeric ? `(?<![\\w.])${escapeRegExp(v.text)}(?!\\w|\\.\\d)` : escapeRegExp(v.text),
    )
    .join("|");
  const pattern = new RegExp(alternation, "g");

  const summary = new Map<string, ReplacementSummary>(
    Object.keys(options.vars).map((name) => [name, { variable: name, byVariant: {}, total: 0, files: [] }]),
  );

  /** Escapes existing {{ then replaces every variant in one pass. */
  const substitute = (text: string, file: string): string => {
    const touched = new Set<string>();
    const out = escapeBraces(text).replace(pattern, (match) => {
      const v = byText.get(match)!;
      const s = summary.get(v.variable)!;
      s.byVariant[match] = (s.byVariant[match] ?? 0) + 1;
      s.total++;
      touched.add(v.variable);
      return v.placeholder;
    });
    for (const name of touched) {
      const s = summary.get(name)!;
      if (!s.files.includes(file)) s.files.push(file);
    }
    return out;
  };

  const walk = (node: JsonStructure, prefix: string): JsonStructure => {
    const out: JsonStructure = {};
    for (const [key, value] of Object.entries(node)) {
      const rel = prefix ? `${prefix}/${key}` : key;
      const newKey = substitute(key, rel);
      if (newKey in out) {
        throw new Error(`Two paths in ${prefix || "the project root"} become "${newKey}" after substitution.`);
      }
      if (typeof value === "string") {
        // Binary files are stored as base64 and never rendered, so leave them alone.
        out[newKey] = decodeBinary(value) ? value : substitute(value, rel);
      } else if (value && typeof value === "object") {
        out[newKey] = walk(value as JsonStructure, rel);
      }
    }
    return out;
  };

  const files = walk(tree, "");

  const variables: Record<string, VariableDef> = {};
  for (const [name, value] of Object.entries(options.vars)) {
    if (name === "projectName") {
      // Defaults to the name given to `create`, so no default here.
      variables[name] = { type: "string", description: "Project name" };
    } else if (NUMBER.test(value)) {
      variables[name] = { type: "number", default: Number(value) };
    } else {
      variables[name] = { type: "string", default: value };
    }
  }

  const template: Record<string, unknown> = {
    $schema: TEMPLATE_SCHEMA_URL,
    skelpro: 2,
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    variables,
    files,
  };

  const list = [...summary.values()];
  return {
    template,
    summary: list,
    unused: list.filter((s) => s.total === 0).map((s) => s.variable),
  };
}
