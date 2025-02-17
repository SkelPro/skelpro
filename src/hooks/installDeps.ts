import fs from "fs";
import { exec } from "child_process";
import ora from "ora";

export default function installDeps(tempDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const items = fs.readdirSync(tempDir, { withFileTypes: true });

    items.forEach((item) => {      
      if (item.name === "packege.json") {
        const spinner = ora("Installing NPM dependencies...").start();
        exec(
          "npm install", 
          { cwd: tempDir }, 
          (error, stdout, stderr) => {
            if (error) {
              console.error(`\nError installing dependencies: ${error.message}`);
              spinner.fail("Error.");
              spinner.stop();
              
              return reject(error);
            }
            
            spinner.succeed("NPM dependencies installed successfully.");
            spinner.stop();
          }
        );
      }

      if (item.name === "requirements.txt") {
        const spinner = ora("Installing python dependencies...").start();
        exec(
          "pip install -r requirements.txt", 
          { cwd: tempDir }, 
          (error, stdout, stderr) => {
            if (error) {
              console.error(`\nError installing dependencies: ${error.message}`);
              spinner.fail("Error.");
              spinner.stop();
              
              return reject(error);
            }

            spinner.succeed("Python dependencies installed successfully.");
            spinner.stop();
          }
        );
      }  
    });
    
    resolve();
  });
}
