import inquirer from "inquirer";
import ora from "ora";
import typeglide from "typeglide";
import { tone } from "tonelog";
import type { Answers } from "./types/structures";
import { createTemplate, scaffoldTemplate, fetchTemplate } from "./actions"
import asciiArt from "./utils/asciiArt";

interface Actions {
  name: string;
  value: string;
}

// Actions available to the user
const choices: Actions[] = [
  { name: "📁 Scaffold template - Scaffolds project skeleton JSON template", value: "Scaffold template" },
  { name: "📦 Create template - Generate a reusable template or should i say 'skeleton'", value: "Create template" },
  { name: "🌐 Fetch template from URL and scaffold project", value: "Fetch and Scaffold" },
  { name: "Exit", value: "Exit" },
];

export default async function main() {
  console.log(`${asciiArt}`);
  
  await typeglide({
    strings: [
      tone.bright_cyan("\n 💀 SkelPro"),
      tone.white(`The spookily smart tool that breathes life into your projects!\n`),
    ],
    backspace: false,
    singleLine: true,
    seperator: " - " // Seperate title from the description
  });
  
  // Prompt
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices: choices,
    },
    {
      type: "input",
      name: "srcPath",
      message: "Enter the path to your template directory:",
      when: (answers) => answers.action === "Create template",
      validate: (input) => input ? true : "Path cannot be empty",
    },
    {
      type: "input",
      name: "srcPath",
      message: "Enter the path to your template:",
      when: (answers) => answers.action === "Scaffold template",
      validate: (input) => input ? true : "Path cannot be empty",
    },
    {
      type: "input",
      name: "fileName",
      message: "Give your template a name:",
      when: (answers) => answers.action === "Create template",
      validate: (input) => input ? true : "Template name cannot be empty",
    },
    {
      type: "input",
      name: "url",
      message: "Enter the URL to fetch the template from:",
      when: (answers) => answers.action === "Fetch and Scaffold",
      validate: (input) => input ? true : "URL cannot be empty",
    },
    {
      type: "input",
      name: "baseName",
      message: "Whats's the name of your project:",
      when: (answers) => answers.action === "Scaffold template" || answers.action === "Fetch and Scaffold",
      validate: (input) => input ? true : "Project name name cannot be empty",
    },
  ]);

  await setux(answers);
}

async function setux(answers: Answers) {
  const spinner = ora("Bone by Bone, Hang on tight...\n").start();

  try {
    switch (answers.action) {
      case "Create template": {
        createTemplate(answers.srcPath, answers.fileName);
        break;
      }
      case "Scaffold template": {
        scaffoldTemplate(answers.srcPath, answers.baseName);
        break;
      }
      case "Fetch and Scaffold": {
        fetchTemplate(answers.url, answers.baseName);
        break;
      }
      case "Exit":
        spinner.text = "Exit.";
        break;
      default:
        console.log("End.");
    }
    spinner.succeed(".");
  } catch (error) {
    spinner.fail("⚠ Something went wrong.");
    console.error(error);
  } finally {
    spinner.stop();
  }
}
