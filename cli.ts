#!/usr/bin/env node

import { Command } from "commander";
import { VERSION } from "./src/utils/constant";
import main from "./src/index";
import { createTemplate, scaffoldTemplate, fetchTemplate } from "./src/actions";

// News and Updates...
import { checkNewVersion, fetchNews, logUpdates } from "./src/hooks/getUpdates";

const program = new Command();

program
  .name("Skelpro")
  .usage("[options] [command]")
  .description("A fast and simple tool to set up your project structure in seconds.")
  .version(`v${VERSION}`, "-v, --version", "Output the version number")

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
  .command("create <projectName> <templatePath>")
  .description("Creates a project using a local or remote JSON template")
  .option('-i, --install', 'Install dependencies flag')
  .action(async (projectName, templatePath, opt) => {
    const install = opt.install ? true : false;
    
    const version = await checkNewVersion();
    const news = fetchNews();

    if (templatePath.startsWith("http")) {
      fetchTemplate(templatePath, projectName, install);
      logUpdates(version, news);
    } else {
      scaffoldTemplate(templatePath, projectName, install)
    }
  });

// Legacy commands...
program
  .command("start")
  .description("Launches the main CLI interface")
  .action(() => {
    main().catch((error) => console.error(error));
  });

program
  .command("generate <templateName> <projectPath>")
  .description("Saves a new reusable project template")
  .action((templateName, projectPath) => {
    createTemplate(projectPath, templateName);
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
