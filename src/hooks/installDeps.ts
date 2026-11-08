import fs from "fs";
import path from "path";
import ora from "ora";
import { execFile, execFileSync } from "child_process";
import { promisify } from "util";

const execFilePromise = promisify(execFile);

export interface InstallStep {
  label: string;
  command: string;
  args: string[];
}

export interface InstallEnv {
  platform: NodeJS.Platform;
  /** True if `cmd` can be run from PATH. */
  hasCommand(cmd: string): boolean;
}

// On Windows, npm/pnpm/yarn are .cmd shims, which Node can only start
// through a shell. Commands and arguments here are fixed strings chosen by
// SkelPro, never template content, so that is safe.
// Node warns (DEP0190) when an args array is combined with `shell`, so the
// fixed arguments are joined into one command line in that case.
const useShell = process.platform === "win32";

export function commandExists(cmd: string): boolean {
  try {
    if (useShell) {
      execFileSync(`${cmd} --version`, { stdio: "ignore", shell: true });
    } else {
      execFileSync(cmd, ["--version"], { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

const defaultEnv: InstallEnv = {
  platform: process.platform,
  hasCommand: commandExists,
};

function venvPip(dir: string, platform: NodeJS.Platform): string {
  return platform === "win32"
    ? path.join(dir, "venv", "Scripts", "pip.exe")
    : path.join(dir, "venv", "bin", "pip");
}

/**
 * Decides which installers to run for a project, without running anything.
 * At most one Node installer and one Python installer are chosen.
 */
export function planInstall(
  dir: string,
  env: InstallEnv = defaultEnv,
): InstallStep[] {
  const has = (name: string) => fs.existsSync(path.join(dir, name));
  const steps: InstallStep[] = [];

  // Node: lockfiles first, then fall back to package.json.
  if (has("pnpm-lock.yaml")) {
    steps.push({ label: "pnpm", command: "pnpm", args: ["install"] });
  } else if (has("yarn.lock")) {
    steps.push({ label: "Yarn", command: "yarn", args: ["install"] });
  } else if (has("bun.lockb") || has("bun.lock")) {
    steps.push({ label: "Bun", command: "bun", args: ["install"] });
  } else if (has("package.json")) {
    steps.push({ label: "npm", command: "npm", args: ["install"] });
  }

  // Python
  const hasRequirements = has("requirements.txt");
  const hasPyproject = has("pyproject.toml");

  if (hasPyproject && !hasRequirements && env.hasCommand("uv")) {
    steps.push({ label: "uv", command: "uv", args: ["sync"] });
  } else if (hasRequirements || hasPyproject) {
    // Many Linux and macOS machines have no `python`, only `python3`.
    const python = env.hasCommand("python3") ? "python3" : "python";
    const pip = venvPip(dir, env.platform);

    steps.push({
      label: "Python venv",
      command: python,
      args: ["-m", "venv", "venv"],
    });
    steps.push(
      hasRequirements
        ? { label: "pip", command: pip, args: ["install", "-r", "requirements.txt"] }
        : { label: "pip", command: pip, args: ["install", "-e", "."] },
    );
  }

  return steps;
}

export type StepRunner = (step: InstallStep, cwd: string) => Promise<void>;

const runStep: StepRunner = async (step, cwd) => {
  // An absolute path (the venv's pip) is a real executable; no shell needed.
  if (useShell && !path.isAbsolute(step.command)) {
    await execFilePromise([step.command, ...step.args].join(" "), { cwd, shell: true });
  } else {
    await execFilePromise(step.command, step.args, { cwd });
  }
};

export default async function installDeps(
  dir: string,
  run: StepRunner = runStep,
  env: InstallEnv = defaultEnv,
): Promise<void> {
  const steps = planInstall(dir, env);

  if (!steps.length) {
    console.log("No dependency manifest found; nothing to install.");
    return;
  }

  for (const step of steps) {
    const shown = `${path.basename(step.command)} ${step.args.join(" ")}`;
    const spinner = ora(`Running ${shown}...`).start();
    try {
      await run(step, dir);
      spinner.succeed(`${step.label}: ${shown} finished.`);
    } catch (error) {
      spinner.fail(`${step.label}: ${shown} failed.`);
      throw error;
    }
  }
}
