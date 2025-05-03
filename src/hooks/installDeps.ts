import fs from "fs";
import { exec } from "child_process";
import ora from "ora";
import { promisify } from "util";
import { toneLevel, tone } from "tonelog";

const execPromise = promisify(exec);

interface OSCommand {
  osType: "win32" | "darwin";
  comma: string;
}

interface Command {
  osRequired: boolean;
  command?: string;
  osCommand?: OSCommand[];
}



const npmCommands = [
  {
    command1: "",
    osrequired: false
  },
  {
    osRequired: true,
    commands: [
      {
        type: "win32",
        command: "vla"
      }
    ]
  }
]


// async function install(
//   tempDir: string, 
//   lockFile: string,
//   installTree: Command[]
// ) {
//   const items = fs.readdirSync(tempDir, { withFileTypes: true });

//   try {
//     for (const item of items) {
//       const spinner = ora("Installing NPM dependencies...").start();
//       for (const command of installTree) {
//         try {
//           if (command.osRequired) {
//             if (process.platform === "win32") {
//               await execPromise(
//                 ".\\venv\\Scripts\\activate", 
//                 { cwd: tempDir }
//               );
//             } else {
//               await execPromise(
//                 "source venv/bin/activate", 
//                 { cwd: tempDir }
//               );
//             }
//           }
//         }
//       }
//     }
//   }
// }

async function inst(
  tempDir: string,
  lockFile: string,
  installTree: Command[]
) {
  const items = fs.readdirSync(tempDir, { withFileTypes: true });

  try {
    for (const item of items) {
      const spinner = ora("Installing Dependencies...").start();
      for (const comm of installTree) {
        try {
          if (comm.osRequired) {
            if (process.platform === "win32" && comm.osCommand) {
              // await execPromise(comm.osCommand.os)
            }
          }
        }
      }
    }
  }
}


export default async function installDeps(tempDir: string): Promise<void> {
  const items = fs.readdirSync(tempDir, { withFileTypes: true });

  try {
    for (const item of items) {
      if (item.name === "package-lock.json") {
        const spinner = ora("Installing NPM dependencies...").start();
        try {
          await execPromise("npm install", { cwd: tempDir });
          spinner.succeed("NPM dependencies installed successfully.");
        } catch (error) {
          spinner.fail("Error installing NPM dependencies.");
          console.error(`\nError: ${(error as Error).message}`);
          throw error;
        } finally {
          spinner.stop();
        }
      }

      if (item.name === "yarn.lock") {
        const spinner = ora("Insalling dependencies with Yarn...").start();
        try {
          await execPromise("yarn add", { cwd: tempDir });
          spinner.succeed("Dependencies installed successfully.");
        } catch (error) {
          spinner.fail(toneLevel.error(tone.white(`\nError installing dependencies...`)))
          console.error(`\nError: ${(error as Error).message}`);
          throw error
        } finally {
          spinner.stop();
        }
      }

      if (item.name === "requirements.txt") {
        const spinner = ora("Installing Python dependencies...").start();
        try {
          await execPromise("python -m venv venv", { cwd: tempDir });

          // we activate the virtual environment based on the OS
          if (process.platform === "win32") {
            await execPromise(
              ".\\venv\\Scripts\\activate", 
              { cwd: tempDir }
            );
          } else {
            await execPromise(
              "source venv/bin/activate", 
              { cwd: tempDir }
            );
          }

          await execPromise("pip install -r requirements.txt", { cwd: tempDir });
          
          spinner.succeed("Python dependencies installed successfully.");
        } catch (error) {
          spinner.fail("Error installing Python dependencies.");
          console.error(`\nError: ${(error as Error).message}`);
          throw error;
        } finally {
          spinner.stop();
        }
      }
    }
  } catch (error) {
    throw error;
  }
}

