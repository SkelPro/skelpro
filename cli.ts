#!/usr/bin/env node

import { Command } from "commander";
import { VERSION } from "./src/utils/constant";
import main from "./src/index";
import { createTemplate, scaffoldTemplate, describeTemplate } from "./src/actions";
import { cleanupWorktree } from "./src/hooks/cleanupWorktree";
import { applyInitPlan, planInitAgents } from "./src/template/init-agents";
import { buildReport, exitCodeFor, listProjectPaths } from "./src/check/check";
import { loadCheckConfig } from "./src/check/config";
import { formatGithub, formatText } from "./src/check/format";
import path from "path";

// News and Updates...
import logUpdates, { updatesDisabled } from "./src/hooks/logUpdates";

const program = new Command();

/** Lets an option be given more than once: --include a --include b */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

program
  .name("skelpro")
  .usage("[options] [command]")
  .description(
    "A fast and simple tool to set up your project structure in seconds.",
  )
  .version(`Version ${VERSION}`, "-v, --version", "Output the version number")
  .option("-q, --quiet", "Don't print news or update notices");

program
  .command("launch")
  .description("Launches the main CLI interface")
  .action(async () => {
    await main();
  });

program
  .command("save <templateName> <projectPath>")
  .description("Saves a new reusable project template")
  .option(
    "--include <glob>",
    "Always keep paths matching this glob (repeatable)",
    collect,
    [],
  )
  .option(
    "--exclude <glob>",
    "Also skip paths matching this glob (repeatable)",
    collect,
    [],
  )
  .option(
    "--var <name=value>",
    "Replace this value with {{name}} to make a v2 template (repeatable)",
    collect,
    [],
  )
  .option("--description <text>", "Description for a v2 template")
  .action(async (templateName, projectPath, opt) => {
    await createTemplate(projectPath, templateName, {
      include: opt.include,
      exclude: opt.exclude,
      vars: opt.var,
      description: opt.description,
    });
  });

program
  .command("cleanup <repoPath> <worktreePath>")
  .description("Remove a Git worktree and clean related references (for agents)")
  .option("-b, --branch <branchName>", "Also delete this branch")
  .option(
    "-f, --force",
    "Discard uncommitted changes and delete the branch even if unmerged",
  )
  .action((repoPath, worktreePath, opt) => {
    cleanupWorktree(repoPath, worktreePath, {
      branch: opt.branch,
      force: Boolean(opt.force),
    });
  });

program
  .command("create <projectName> <templatePath>")
  .description("Creates a project using a local or remote JSON template")
  .option("-i, --install", "Install dependencies flag")
  .option("-w, --worktree", "Create as Git worktree")
  .option("-b, --branch <branchName>", "Git branch name for worktree")
  .option(
    "--var <name=value>",
    "Set a template variable (repeatable)",
    collect,
    [],
  )
  .option("--vars <file>", "Read template variables from a JSON file")
  .option("-y, --yes", "Use defaults and never prompt; missing variables are an error")
  .action(async (projectName, templatePath, opt) => {
    const worktree = Boolean(opt.worktree);

    if (worktree && !opt.branch) {
      throw new Error("--branch is required when using --worktree");
    }

    await scaffoldTemplate(
      templatePath,
      projectName,
      Boolean(opt.install),
      worktree,
      opt.branch,
      { vars: opt.var, varsFile: opt.vars, yes: Boolean(opt.yes) },
    );
  });

program
  .command("info <templatePath>")
  .description("Show a template's name, description, variables and files")
  .option("--json", "Print machine-readable JSON")
  .action(async (templatePath, opt) => {
    const info = await describeTemplate(templatePath);

    if (opt.json) {
      console.log(JSON.stringify(info, null, 2));
      return;
    }

    console.log(`${info.name ?? templatePath} (template v${info.version})`);
    if (info.description) console.log(info.description);

    const vars = Object.entries(info.variables);
    console.log(`\nVariables${vars.length ? "" : ": none"}`);
    for (const [name, def] of vars) {
      const details = [
        def.type,
        def.default !== undefined ? `default ${JSON.stringify(def.default)}` : name === "projectName" ? "default: project name" : "required",
        def.options ? `one of ${def.options.join("|")}` : "",
        def.pattern ? `pattern ${def.pattern}` : "",
      ].filter(Boolean);
      console.log(`  ${name}  ${details.join(", ")}${def.description ? `  - ${def.description}` : ""}`);
    }

    console.log(`\nFiles (${info.files.length})`);
    for (const file of info.files.slice(0, 50)) console.log(`  ${file}`);
    if (info.files.length > 50) console.log(`  ...and ${info.files.length - 50} more`);

    const layout = Object.entries(info.layout);
    if (layout.length) {
      console.log(`\nLayout (${layout.length})`);
      for (const [p, entry] of layout) {
        const notes = [entry.naming, entry.required ? "required" : "", entry.$when ? `when ${entry.$when}` : ""]
          .filter(Boolean)
          .join(", ");
        console.log(`  ${p}/  ${entry.purpose}${notes ? `  [${notes}]` : ""}`);
      }
    }

    if (info.rules.length) {
      console.log(`\nRules (${info.rules.length})`);
      for (const rule of info.rules) {
        const what = "forbid" in rule ? `forbid ${rule.forbid}` : `${rule.match} expects ${rule.expect}`;
        console.log(`  ${rule.id}  ${what}  [${rule.severity}]`);
      }
    }

    if (info.version === 2) {
      const agentFiles = [
        ...(info.hasAgentsFile ? ["AGENTS.md", ...(info.agents?.pointerFiles ?? [])] : []),
        ".skelpro.json",
      ];
      console.log(`\nGenerated for agents: ${agentFiles.join(", ")}`);
    }
  });

program
  .command("init-agents [projectPath]")
  .description(
    "Add AGENTS.md, pointer files and .skelpro.json to an existing project",
  )
  .option(
    "--pointer <file>",
    "Pointer file to add, linking to AGENTS.md (repeatable; default CLAUDE.md)",
    collect,
    [],
  )
  .option("--no-pointers", "Don't add any pointer files")
  .option("--dry-run", "Show what would change without writing anything")
  .option("-f, --force", "Regenerate an existing .skelpro.json")
  .action((projectPath, opt) => {
    const pointerFiles = opt.pointers
      ? opt.pointer.length
        ? opt.pointer
        : ["CLAUDE.md"]
      : [];

    const plan = planInitAgents(projectPath ?? ".", {
      pointerFiles,
      force: Boolean(opt.force),
      skelproVersion: VERSION,
    });

    const verb = { create: "create", append: "update", replace: "replace", skip: "skip" } as const;
    console.log(opt.dryRun ? "Dry run, nothing written:" : `Setting up ${plan.root} for coding agents:`);
    for (const change of plan.changes) {
      const why = change.action === "skip" ? ` (${change.reason})` : "";
      console.log(`  ${verb[change.action].padEnd(7)} ${change.path}${why}`);
    }

    if (opt.dryRun) return;
    applyInitPlan(plan);

    const touched = plan.changes.filter((c) => c.action !== "skip").map((c) => c.path);
    const withTodos = touched.filter((p) => p === "AGENTS.md" || p === ".skelpro.json");
    console.log(
      withTodos.length
        ? `\nNext: replace the TODOs in ${withTodos.join(" and ")} with what each folder is for, then commit.`
        : "\nNothing to add.",
    );
  });

program
  .command("check [projectPath]")
  .description("Check a project's structure against its layout and rules")
  .option("--template <path>", "Check against a template instead of .skelpro.json")
  .option(
    "--var <name=value>",
    "Template variable, with --template (repeatable)",
    collect,
    [],
  )
  .option("--json", "Print the report as JSON")
  .option("--format <format>", "Output format: text, json or github", "text")
  .option("--strict", "Fail on warnings too, not just errors")
  .action(async (projectPath, opt) => {
    const dir = path.resolve(projectPath ?? ".");
    const format: string = opt.json ? "json" : opt.format;

    try {
      if (!["text", "json", "github"].includes(format)) {
        throw new Error(`Unknown --format "${format}"; use text, json or github.`);
      }
      const vars: Record<string, string> = {};
      for (const pair of opt.var as string[]) {
        const eq = pair.indexOf("=");
        if (eq <= 0) throw new Error(`Invalid --var "${pair}": use --var name=value.`);
        vars[pair.slice(0, eq)] = pair.slice(eq + 1);
      }
      if (Object.keys(vars).length && !opt.template) {
        throw new Error("--var only applies with --template.");
      }

      const loaded = await loadCheckConfig(dir, { template: opt.template, vars });
      const report = buildReport(loaded.config, listProjectPaths(dir), loaded.template);

      if (format === "json") process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      else if (format === "github") process.stdout.write(formatGithub(report, path.basename(dir)));
      else process.stdout.write(formatText(report, path.basename(dir)));

      process.exitCode = exitCodeFor(report, Boolean(opt.strict));
    } catch (error) {
      // 2 = SkelPro couldn't run the check, as opposed to 1 = the project has errors.
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 2;
    }
  });

// Runs after every command completes successfully
program.hook("postAction", async (_program, actionCommand) => {
  // Machine-readable output must stay parseable: no banner after --json or --format json/github.
  const opts = actionCommand.opts();
  const machineReadable = opts.json || (opts.format !== undefined && opts.format !== "text");
  if (updatesDisabled(program.opts().quiet) || machineReadable) return;
  try {
    await logUpdates();
  } catch {
    // Never break CLI because update checking failed
  }
});

async function run() {
  if (!process.argv.slice(2).length) {
    program.outputHelp();
    return;
  }

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    // Agents and CI rely on the exit code, so failures must never exit 0.
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

run();
