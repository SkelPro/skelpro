/**
 * Creating a project from a template, as a library: returns results and
 * throws typed errors, never prints or prompts. The MCP server uses this;
 * a dry run returns the plan without writing anything.
 */
import fs from "fs";
import path from "path";
import { planScaffold, writePlan } from "../hooks/scaffoldJSON";
import { addAgentFiles } from "../template/agents";
import { parseTemplate, renderTemplate, resolveVariables } from "../template/render";
import { VERSION } from "../utils/constant";
import { SkelproError } from "./errors";
import type { Limits } from "./templates";

export interface ScaffoldRequest {
  /** Parsed template JSON. */
  json: unknown;
  /** Where the template came from, recorded in .skelpro.json. */
  source: string;
  /** Absolute project folder. */
  targetDir: string;
  variables?: Record<string, unknown>;
  dryRun: boolean;
  overwrite: boolean;
  limits: Limits;
}

export interface ScaffoldResult {
  targetDir: string;
  dryRun: boolean;
  written: boolean;
  /** Every file the template creates, relative to targetDir. */
  files: string[];
  /** Files that already exist and would be (or were, with overwrite) replaced. */
  conflicts: string[];
  totalBytes: number;
  /** The generated AGENTS.md, if any, so the caller can read the conventions. */
  agentsMd?: string;
}

export async function scaffoldProject(request: ScaffoldRequest): Promise<ScaffoldResult> {
  const { targetDir, limits } = request;

  const template = parseTemplate(request.json);
  const vars = await resolveVariables(template, {
    projectName: path.basename(targetDir),
    provided: request.variables ?? {},
    // No `ask`: missing variables are an error the caller can fix.
  });
  const tree = addAgentFiles(template, vars, renderTemplate(template, vars), {
    source: request.source,
    projectDir: targetDir,
    skelproVersion: VERSION,
  });

  const plan = planScaffold(targetDir, tree);
  const rel = (p: string) => path.relative(targetDir, p).split(path.sep).join("/");

  const files: string[] = [];
  const conflicts: string[] = [];
  let totalBytes = 0;

  for (const entry of plan) {
    if (entry.kind === "dir") {
      if (fs.existsSync(entry.path) && !fs.statSync(entry.path).isDirectory()) {
        throw new SkelproError(
          "conflicts",
          `${rel(entry.path)} is a file, but the template needs a folder there.`,
          "Pick another targetDir; overwrite never replaces a file with a folder.",
        );
      }
      continue;
    }
    files.push(rel(entry.path));
    totalBytes += Buffer.byteLength(entry.content);
    if (fs.existsSync(entry.path)) {
      if (fs.statSync(entry.path).isDirectory()) {
        throw new SkelproError(
          "conflicts",
          `${rel(entry.path)} is a folder, but the template needs a file there.`,
          "Pick another targetDir; overwrite never replaces a folder with a file.",
        );
      }
      conflicts.push(rel(entry.path));
    }
  }

  if (files.length > limits.maxFiles) {
    throw new SkelproError(
      "limit_exceeded",
      `The template would create ${files.length} files; the limit is ${limits.maxFiles}.`,
      "Raise limits.maxFiles in ~/.skelpro/config.json if this template is trusted.",
    );
  }
  if (totalBytes > limits.maxBytes) {
    throw new SkelproError(
      "limit_exceeded",
      `The template would write ${totalBytes} bytes; the limit is ${limits.maxBytes}.`,
      "Raise limits.maxBytes in ~/.skelpro/config.json if this template is trusted.",
    );
  }

  const agentsMd = typeof tree["AGENTS.md"] === "string" ? (tree["AGENTS.md"] as string) : undefined;
  const result: ScaffoldResult = {
    targetDir,
    dryRun: request.dryRun,
    written: false,
    files,
    conflicts,
    totalBytes,
    ...(agentsMd ? { agentsMd } : {}),
  };
  if (request.dryRun) return result;

  if (conflicts.length && !request.overwrite) {
    throw new SkelproError(
      "conflicts",
      `${conflicts.length} file(s) already exist in ${targetDir}: ${conflicts.slice(0, 20).join(", ")}${conflicts.length > 20 ? ", ..." : ""}`,
      "Pick an empty targetDir, or pass overwrite: true to replace these files.",
      { conflicts },
    );
  }

  writePlan(targetDir, plan);
  return { ...result, written: true };
}
