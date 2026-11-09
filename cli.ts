#!/usr/bin/env node

import { Command } from "commander";
import { VERSION } from "./src/utils/constant";
import main from "./src/index";
import { createTemplate, scaffoldTemplate, describeTemplate } from "./src/actions";
import { cleanupWorktree } from "./src/hooks/cleanupWorktree";

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
  });

// Runs after every command completes successfully
program.hook("postAction", async (_program, actionCommand) => {
  // Machine-readable output must stay parseable: no banner after --json.
  if (updatesDisabled(program.opts().quiet) || actionCommand.opts().json) return;
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
