import path from "path";
import { spawn } from "child_process";

const ROOT = path.resolve(__dirname, "..", "..");
const TS_NODE = path.join(ROOT, "node_modules", "ts-node", "dist", "bin.js");

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs the real CLI from source, the way an agent or CI would: stdin is a
 * closed pipe (never a TTY) and update checks are off.
 *
 * Async on purpose. spawnSync blocks the Vitest worker for the few seconds
 * ts-node needs to start, and with enough CLI tests the worker misses its
 * heartbeat and Vitest fails the run with "Timeout calling onTaskUpdate".
 */
export function runCli(cwd: string, args: string[], timeoutMs = 60_000): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [TS_NODE, "--transpile-only", path.join(ROOT, "cli.ts"), ...args],
      { cwd, env: { ...process.env, NO_UPDATE_NOTIFIER: "1" }, stdio: ["pipe", "pipe", "pipe"] },
    );

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
