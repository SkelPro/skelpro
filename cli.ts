#!/usr/bin/env node

import { Command } from "commander";
import { VERSION } from "./src/utils/constant";
import main from "./src/index";
import { createTemplate, scaffoldTemplate, fetchTemplate } from "./src/actions";

const program = new Command();

program.version(`SkelPro v${VERSION}`, "-v, --version", "Output the version number");

program
  .command("start")
  .description("Start the command line interface 'Home'")
  .action(() => {
    main().catch((error) => console.error(error));
  });

program
  .command("generate <templateName> <projectPath>")
  .description("Generate a reusable template or should i say 'skeleton'")
  .action((templateName, projectPath) => {
    createTemplate(projectPath, templateName);
  });


program
  .command("create <projectName> <templatePath>")
  .description("Scaffolds project skeleton from the specified JSON template path or URL")
  .action((projectName, templatePath) => {
    if (templatePath.startsWith("http")) {
      fetchTemplate(templatePath, projectName);
    } else {
      scaffoldTemplate(templatePath, projectName)
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
