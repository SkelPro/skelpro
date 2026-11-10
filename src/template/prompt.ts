import inquirer from "inquirer";
import type { VariableDef } from "./render";

/** Prompts in a terminal for variables that have no value yet. */
export async function askForVariables(
  missing: Array<[string, VariableDef]>,
): Promise<Record<string, unknown>> {
  const questions = missing.map(([name, def]) => {
    const message = def.description ? `${name} (${def.description}):` : `${name}:`;

    switch (def.type) {
      case "boolean":
        return { type: "confirm", name, message };
      case "enum":
        return { type: "list", name, message, choices: def.options };
      case "number":
        return {
          type: "input",
          name,
          message,
          validate: (input: string) =>
            input.trim() !== "" && Number.isFinite(Number(input)) ? true : "Enter a number",
        };
      default:
        return {
          type: "input",
          name,
          message,
          validate: (input: string) => {
            if (!input) return `${name} cannot be empty`;
            if (def.pattern && !new RegExp(def.pattern).test(input)) {
              return `Must match ${def.pattern}`;
            }
            return true;
          },
        };
    }
  });

  return inquirer.prompt(questions as never);
}

/**
 * Prompting only makes sense with a person at a terminal. Agents and CI get
 * a clear "missing variable" error instead of a prompt that hangs forever.
 */
export function canPrompt(yes?: boolean): boolean {
  return !yes && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
}
