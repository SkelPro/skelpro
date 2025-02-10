import fs from "fs";
import { exec } from "child_process"

export default function installDeps(tempDir: string) {
  exec(`cd ${tempDir}`, (error) => {
    if (error) {
      console.error(error);
    }
  });

  const items = fs.readdirSync(tempDir, { withFileTypes: true });
  
  items.forEach((item) => { 
    if (item.name === "packege.json") {
      exec('npm install', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error installing dependencies: ${error}`);
          return;
        }
        console.log("Dependencies installed successfully.");
      })
    } 
    
    if (item.name === "requirements.txt") {
      exec('pip install -r requirements.txt', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error installing dependencies: ${error}`);
          return;
        }
        console.log("Dependencies installed successfully.");
      })
    }

    if (item.name === "Cargo.toml") {
      exec('cargo build', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error installing dependencies: ${error}`);
          return;
        }
        console.log("Dependencies installed successfully.");
      })
    }
  })
}
