import inquirer from "inquirer";
import typeglide from "typeglide";
import { tone } from "tonelog";

import type { Actions, Answers } from "./types/structures";
import { createTemplate, scaffoldTemplate, fetchTemplate } from "./actions";
import asciiArt from "./utils/asciiArt";
// News and Updates...
import getUpdates from "./hooks/getUpdates";

// Actions available to the user
const choices: Actions[] = [
  { name: "📁 Scaffold template - Scaffolds project skeleton (JSON template)", value: "Scaffold template" },
  { name: "📦 Create template - Generate a reusable template", value: "Create template" },
  { name: "🌐 Remote template - Fetch template from URL and scaffold project", value: "Fetch and Scaffold" },
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
    separator: " - " // Seperate title from the description
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
    {
      type: "confirm",
      name: "install",
      message: "Do you want to install dependencies:",
      when: (answers) => answers.action === "Scaffold template" || answers.action === "Fetch and Scaffold",
    },
  ]);

  await setup(answers);
}

async function setup(answers: Answers) {
  console.log(
    tone.gray(`Bone by Bone, Hang on tight${tone.white("...")}\n`)
  );

  try {
    switch (answers.action) {
      case "Create template": {
        createTemplate(answers.srcPath, answers.fileName);
        break;
      }
      case "Scaffold template": {
        scaffoldTemplate(answers.srcPath, answers.baseName, answers.install);
        console.log("");
        break;
      }
      case "Fetch and Scaffold": {
        fetchTemplate(answers.url, answers.baseName, answers.install);
        console.log("");
        break;
      }
      case "Exit":
        console.log("Exit.");
        break;
      default:
        console.log("End.");
    }

    getUpdates(); // Log news and updates notifications.
  } catch (error) {
    console.log(
      tone.error("⚠ Something went wrong.")
    );
    console.error(error);
  } finally {
    console.log(".");
  }
}
