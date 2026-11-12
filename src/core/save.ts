/**
 * Saving a project as a template, as a library: returns what it did instead
 * of printing. Used by the MCP save_template tool.
 */
import fs from "fs";
import path from "path";
import { minimatch } from "minimatch";
import createJSON from "../hooks/createJSON";
import { listPaths } from "../template/render";
import { reverseTemplate, type ReplacementSummary } from "../template/reverse";
import { SkelproError } from "./errors";
import type { Limits } from "./templates";

export interface SaveRequest {
  /** Absolute project folder to save. */
  sourceDir: string;
  /** Template name: the file is <outDir>/<name>.json. */
  name: string;
  outDir: string;
  /** name → value to replace with {{name}} (makes a v2 template). */
  variables?: Record<string, string>;
  description?: string;
  include?: string[];
  exclude?: string[];
  overwrite: boolean;
  limits: Limits;
}

export interface SaveResult {
  templatePath: string;
  format: 1 | 2;
  fileCount: number;
  bytes: number;
  skipped: Array<{ path: string; reason: string }>;
  replacements?: ReplacementSummary[];
  /** Variables whose value was never found in the project. */
  unusedVariables?: string[];
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function saveTemplate(request: SaveRequest): SaveResult {
  const { sourceDir, name, outDir, limits } = request;

  if (!NAME.test(name)) {
    throw new SkelproError(
      "invalid_input",
      `Invalid template name "${name}".`,
      "Use letters, digits, ., _ and -.",
    );
  }
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new SkelproError("not_found", `${sourceDir} is not a folder.`);
  }

  const templatePath = path.join(outDir, `${name}.json`);
  if (fs.existsSync(templatePath) && !request.overwrite) {
    throw new SkelproError(
      "conflicts",
      `A template named "${name}" already exists at ${templatePath}.`,
      "Pick another name, or pass overwrite: true to replace it.",
    );
  }

  const skippedPaths: string[] = [];
  const tree = createJSON(sourceDir, {
    include: request.include,
    exclude: request.exclude,
    skipped: skippedPaths,
  });
  const skipped = skippedPaths.map((p) => ({
    path: p,
    reason: (request.exclude ?? []).some((g) =>
      minimatch(p.replace(/\/$/, ""), g, { dot: true }),
    )
      ? "matches exclude"
      : "ignored: in .gitignore or never source (dependencies, build output, secrets)",
  }));

  let output: unknown = tree;
  let replacements: ReplacementSummary[] | undefined;
  let unusedVariables: string[] | undefined;
  if (request.variables && Object.keys(request.variables).length) {
    try {
      const reversed = reverseTemplate(tree, {
        name,
        description: request.description,
        vars: request.variables,
      });
      output = reversed.template;
      replacements = reversed.summary;
      unusedVariables = reversed.unused;
    } catch (error) {
      throw new SkelproError("invalid_input", (error as Error).message);
    }
  }

  const fileCount = listPaths(tree).length;
  const text = `${JSON.stringify(output, null, 2)}\n`;
  const bytes = Buffer.byteLength(text);
  if (fileCount > limits.maxFiles) {
    throw new SkelproError(
      "limit_exceeded",
      `The project has ${fileCount} files; the limit is ${limits.maxFiles}.`,
      "Use exclude to leave out generated or vendored folders, or raise limits.maxFiles in ~/.skelpro/config.json.",
    );
  }
  if (bytes > limits.maxBytes) {
    throw new SkelproError(
      "limit_exceeded",
      `The template would be ${bytes} bytes; the limit is ${limits.maxBytes}.`,
      "Use exclude to leave out large files, or raise limits.maxBytes in ~/.skelpro/config.json.",
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(templatePath, text, "utf8");

  return {
    templatePath,
    format: replacements ? 2 : 1,
    fileCount,
    bytes,
    skipped,
    ...(replacements ? { replacements } : {}),
    ...(unusedVariables?.length ? { unusedVariables } : {}),
  };
}
