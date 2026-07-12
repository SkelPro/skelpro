#!/usr/bin/env node

import { Command } from "commander";
import { VERSION } from "./src/utils/constant";
import main from "./src/index";
import { createTemplate, scaffoldTemplate, fetchTemplate } from "./src/actions";

// News and Updates...
import logUpdates from "./src/hooks/logUpdates";

const program = new Command();

program
  .name("Skelpro")
  .usage("[options] [command]")
  .description(
    "A fast and simple tool to set up your project structure in seconds."
  )
  .version(`Version ${VERSION}`, "-v, --version", "Output the version number");

program
  .command("launch")
  .description("Launches the main CLI interface")
  .action(() => {
    main().catch((error) => console.error(error));
  });

program
  .command("save <templateName> <projectPath>")
  .description("Saves a new reusable project template")
  .action((templateName, projectPath) => {
    createTemplate(projectPath, templateName);
  });

program
  .command("cleanup <worktreePath>")
  .description("Remove a Git worktree (for agents)")
  .action((worktreePath) => {
    import("./src/hooks/cleanupWorktree.js").then(({ cleanupWorktree }) => {
      cleanupWorktree(worktreePath);
    });
  });

program
  .command("create <projectName> <templatePath>")
  .description("Creates a project using a local or remote JSON template")
  .option("-i, --install", "Install dependencies flag")
  .option("-w, --worktree", "Create as Git worktree with dedicated agent branch")
  .action(async (projectName, templatePath, opt) => {
    const install = opt.install ? true : false;
    const worktree = opt.worktree ? true : false;

    if (templatePath.startsWith("http")) {
      fetchTemplate(templatePath, projectName, install, worktree);
      logUpdates();
    } else {
      scaffoldTemplate(templatePath, projectName, install, worktree);
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}