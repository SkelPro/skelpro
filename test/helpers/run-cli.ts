import fs from "fs";
import { spawn } from "child_process";
import { COMPILED_CLI } from "./paths";

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs the real CLI the way an agent or CI would: stdin is a closed pipe
 * (never a TTY) and update checks are off.
 *
 * It runs the copy test/global-setup.ts compiled from the current source at
 * the start of this test run, with plain node: starting ts-node for every
 * command made parallel test files slow enough to time out.
 *
 * Async on purpose: spawnSync blocks the Vitest worker, and with enough CLI
 * tests the worker misses its heartbeat ("Timeout calling onTaskUpdate").
 */
export function runCli(cwd: string, args: string[], timeoutMs = 60_000): Promise<CliResult> {
  if (!fs.existsSync(COMPILED_CLI)) {
    return Promise.reject(new Error(`${COMPILED_CLI} is missing; run the tests with "npm test" so global setup compiles it.`));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [COMPILED_CLI, ...args], {
      cwd,
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`skelpro ${args.join(" ")} timed out after ${timeoutMs}ms\n${stderr}`));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });

    child.stdin.end(); // no input, and never a terminal
  });
}
