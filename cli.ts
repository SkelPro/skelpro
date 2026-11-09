#!/usr/bin/env node

import { Command } from "commander";
import { VERSION } from "./src/utils/constant";
import main from "./src/index";
import { createTemplate, scaffoldTemplate, fetchTemplate } from "./src/actions";
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
  .action(async (templateName, projectPath, opt) => {
    await createTemplate(projectPath, templateName, {
      include: opt.include,
      exclude: opt.exclude,
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
  .action(async (projectName, templatePath, opt) => {
    const install = Boolean(opt.install);
    const worktree = Boolean(opt.worktree);
    const branchName = opt.branch;

    if (worktree && !branchName) {
      throw new Error("--branch is required when using --worktree");
    }

    if (/^https?:\/\//i.test(templatePath)) {
      await fetchTemplate(templatePath, projectName, install, worktree, branchName);
    } else {
      await scaffoldTemplate(templatePath, projectName, install, worktree, branchName);
    }
  });

// Runs after every command completes successfully
program.hook("postAction", async () => {
  if (updatesDisabled(program.opts().quiet)) return;
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
