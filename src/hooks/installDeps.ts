import fs from "fs";
import { exec } from "child_process";
import ora from "ora";
import { promisify } from "util";

const execPromise = promisify(exec);

export default async function installDeps(tempDir: string): Promise<void> {
  const items = fs.readdirSync(tempDir, { withFileTypes: true });

  try {
    for (const item of items) {
      if (item.name === "package.json") {
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

