# SkelPro

SkelPro helps developers create consistent project structures quickly.

## Sentencified Overview

> Note: This document uses the Sentencification technique, a proposed technical writing pattern for creating sentence-level overviews that improve document comprehension [Learn more](https://open.substack.com/pub/sydney2o5/p/introducing-sentencification-a-new?utm_source=share&utm_medium=android&r=72irmu)

1. SkelPro is a command-line tool that creates project folders and files from simple templates.
2. You store your project templates as JSON files.
3. SkelPro reads these templates and builds the complete folder structure for you.
4. You can create new templates from existing projects.
5. You can also fetch templates from the internet.
6. SkelPro supports Git worktrees to give each AI agent its own isolated environment.
7. You install SkelPro globally using npm.
8. The main command `skelpro launch` starts an interactive interface.
9. Several other commands let you save templates, create projects, and clean up worktrees.
10. SkelPro works with many programming languages and automatically ignores common temporary files.
11. You can contribute improvements by following the guidelines in CONTRIBUTING.md.
12. The project uses the Apache License 2.0.

## Overview

SkelPro is a fast command-line tool that creates project structures from reusable JSON templates.  
It saves you time when starting new projects or setting up consistent environments.

## Features

- **JSON Templates** — Define project structures in simple JSON files.
- **Quick Scaffolding** — Generate complete project folders and files instantly.
- **Interactive Mode** — Easy-to-use prompts guide you through common tasks.
- **Remote Templates** — Load templates directly from URLs (such as GitHub raw links).
- **Git Worktree Support** — Create isolated environments for AI agents or parallel work.
- **Smart Ignoring** — Automatically skips temporary files, build folders, and dependencies.

## Installation

Install SkelPro globally so you can use it from any directory:

```bash
npm install -g skelpro
```

**Prerequisite**: Node.js (version 18 or higher) must be installed.

## Basic Usage

Run this command to start the interactive interface:

```bash
skelpro launch
```

SkelPro shows a menu. Choose an option and follow the prompts.

### Available Commands

| Command                                     | Description |
|---------------------------------------------|-----------|
| `skelpro launch`                            | Start the interactive interface |
| `skelpro save <name> <path>`                | Save a project as a new JSON template |
| `skelpro create <project> <template>`       | Create a new project from a template |
| `skelpro cleanup <worktree>`                | Remove a Git worktree |
| `skelpro --help`                            | Show all commands and options |

### Common Options

| Option              | Description |
|---------------------|-----------|
| `-i, --install`     | Install dependencies after scaffolding |
| `-w, --worktree`    | Create the project as a Git worktree with its own branch |
| `-v, --version`     | Show the installed version |

## Working with Templates

### Create a Template

Save an existing project as a template:

```bash
skelpro save my-template ./my-project
```

### Create a Project

Use a local template:

```bash
skelpro create my-new-app ./my-template.json
```

Use a remote template:

```bash
skelpro create my-new-app https://raw.githubusercontent.com/user/repo/main/template.json
```

### Git Worktrees for Agents

Create an isolated environment for each agent:

```bash
skelpro create agent-1 ./template.json --worktree
```

Clean up a worktree when finished:

```bash
skelpro cleanup ./agent-1
```

### Remote Template Requirements

Remote templates must return valid JSON.  
Use raw GitHub URLs for best results.

## Contributing

We welcome improvements and bug reports.

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
2. Open an issue or submit a pull request on GitHub.
3. We also plan to add AI features in future versions.

## License

SkelPro is licensed under the Apache License 2.0.  
See the [LICENSE](LICENSE) file for details.
