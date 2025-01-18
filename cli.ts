#!/usr/bin/env node

import { Command } from "commander";
import { VERSION } from "./src/utils/constant";
import main from "./src/index";
import { createTemplate, scaffoldTemplate, fetchTemplate } from "./src/features";

const program = new Command();

program.version(`SkelPro v${VERSION}`, "-v, --version", "Output the version number");

program
  .command("start")
  .description("Start the command line interface 'Home'")
  .action(() => {
    main().catch((error) => console.error(error));
  });

program
  .command("generate-skeleton <dirPath> <tempName>")
  .description("Generate a reusable template or should i say 'skeleton'")
  .action((dirPath, tempName) => {
    createTemplate(dirPath, tempName);
  });


program
  .command("create <tempPath>")
  .description("Scaffolds project skeleton from the specified JSON template path or URL")
  .action((tempPath) => {
    if (tempPath.startsWith("http")) {
      fetchTemplate(tempPath);
    } else {
      scaffoldTemplate(tempPath)
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
