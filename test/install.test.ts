import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import installDeps, { planInstall, type InstallEnv } from "../src/hooks/installDeps";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-inst-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function files(...names: string[]) {
  for (const n of names) fs.writeFileSync(path.join(dir, n), "");
}

function env(available: string[] = [], platform: NodeJS.Platform = "linux"): InstallEnv {
  return { platform, hasCommand: (cmd) => available.includes(cmd) };
}

const cmds = (steps: { command: string; args: string[] }[]) =>
  steps.map((s) => [path.basename(s.command), ...s.args].join(" "));

describe("planInstall: Node", () => {
  it.each([
    [["package.json", "pnpm-lock.yaml"], "pnpm install"],
    [["package.json", "yarn.lock"], "yarn install"],
    [["package.json", "bun.lockb"], "bun install"],
    [["package.json", "bun.lock"], "bun install"],
    [["package.json"], "npm install"],
    [["package.json", "package-lock.json"], "npm install"],
  ])("%j → %s", (names, expected) => {
    files(...names);
    expect(cmds(planInstall(dir, env()))).toEqual([expected]);
  });

  it("runs exactly one Node installer when several lockfiles exist", () => {
    files("package.json", "yarn.lock", "pnpm-lock.yaml", "package-lock.json");
    expect(cmds(planInstall(dir, env()))).toEqual(["pnpm install"]);
  });

  it("does nothing for an empty project", () => {
    expect(planInstall(dir, env())).toEqual([]);
  });
});

describe("planInstall: Python", () => {
  it("requirements.txt → venv, then the venv's own pip", () => {
    files("requirements.txt");
    const steps = planInstall(dir, env(["python3"]));
    expect(cmds(steps)).toEqual([
      "python3 -m venv venv",
      "pip install -r requirements.txt",
    ]);
    expect(steps[1].command).toBe(path.join(dir, "venv", "bin", "pip"));
  });

  it("uses the Windows venv layout on win32", () => {
    files("requirements.txt");
    const steps = planInstall(dir, env(["python"], "win32"));
    expect(steps[0].command).toBe("python");
    expect(steps[1].command).toBe(path.join(dir, "venv", "Scripts", "pip.exe"));
  });

  it("falls back to python when python3 is missing", () => {
    files("requirements.txt");
    expect(planInstall(dir, env(["python"]))[0].command).toBe("python");
  });

  it("pyproject.toml → uv sync when uv is available", () => {
    files("pyproject.toml");
    expect(cmds(planInstall(dir, env(["uv", "python3"])))).toEqual(["uv sync"]);
  });

  it("pyproject.toml → venv + pip install -e . without uv", () => {
    files("pyproject.toml");
    expect(cmds(planInstall(dir, env(["python3"])))).toEqual([
      "python3 -m venv venv",
      "pip install -e .",
    ]);
  });

  it("never runs `source` or a shell activate script", () => {
    files("requirements.txt", "pyproject.toml");
    const all = cmds(planInstall(dir, env(["python3"]))).join("\n");
    expect(all).not.toMatch(/source|activate/);
  });
});

describe("installDeps", () => {
  it("runs the planned steps in order with argument arrays", async () => {
    files("package.json", "requirements.txt");
    const run = vi.fn().mockResolvedValue(undefined);
    await installDeps(dir, run, env(["python3"]));

    expect(run.mock.calls.map(([s]) => [path.basename(s.command), s.args])).toEqual([
      ["npm", ["install"]],
      ["python3", ["-m", "venv", "venv"]],
      ["pip", ["install", "-r", "requirements.txt"]],
    ]);
    expect(run.mock.calls.every(([, cwd]) => cwd === dir)).toBe(true);
  });

  it("stops and rethrows when a step fails", async () => {
    files("package.json", "requirements.txt");
    const run = vi.fn().mockRejectedValueOnce(new Error("boom"));
    await expect(installDeps(dir, run, env(["python3"]))).rejects.toThrow("boom");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
