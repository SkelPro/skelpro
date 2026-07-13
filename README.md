Skeleton Project (SkelPro) 💀

SkelPro helps developers create consistent project structures quickly using reusable templates.

Sentencified Overview

> **Note:** This document uses the Sentencification technique, a proposed technical writing pattern for creating sentence-level overviews that improve document comprehension.  
> Learn more: [Introducing Sentencification: A New Technical Writing Pattern](https://open.substack.com/pub/sydney2o5/p/introducing-sentencification-a-new)

1. SkelPro is a command-line tool that generates complete project structures from JSON templates.
2. You define your project structure using simple JSON template files.
3. SkelPro reads these templates and creates the required folders and files automatically.
4. You can convert existing projects into reusable templates.
5. You can create projects from local templates or remote templates hosted online.
6. SkelPro supports Git worktrees for creating isolated environments for AI agents and parallel development.
7. Each worktree can have its own custom Git branch name.
8. SkelPro provides interactive prompts and command-line options for different workflows.
9. You can automatically install project dependencies after scaffolding.
10. SkelPro ignores common temporary files, dependencies, and build outputs when creating templates.
11. SkelPro includes update notifications to inform users about new versions.
12. You can contribute improvements by following the guidelines in CONTRIBUTING.md.
13. The project is licensed under the Apache License 2.0.

---

Overview

SkelPro is a fast command-line tool that creates project structures from reusable JSON templates.

It helps developers avoid repetitive setup tasks by generating consistent project environments in seconds.

---

Features

- JSON Templates — Define complete project structures using simple JSON files.
- Quick Scaffolding — Generate folders and files instantly from templates.
- Interactive Mode — Guided prompts for common project setup tasks.
- Remote Templates — Fetch templates directly from online sources such as GitHub raw URLs.
- Git Worktree Support — Create isolated development environments for AI agents or parallel tasks.
- Custom Agent Branches — Assign a unique Git branch name when creating worktrees.
- Dependency Installation — Automatically install project dependencies after generation.
- Smart Ignoring — Skip temporary files, dependencies, and build directories when creating templates.
- Update Notifications — Receive information about new SkelPro releases and project updates.

---

Installation

Install SkelPro globally using npm:

npm install -g skelpro

Prerequisite: Node.js version 18 or higher is required.

---

Basic Usage

Start the interactive interface:

skelpro launch

SkelPro will display available actions and guide you through the process.

---

Available Commands

Command| Description
"skelpro launch"| Start the interactive CLI interface
"skelpro save <name> <path>"| Save an existing project as a JSON template
"skelpro create <project> <template>"| Generate a project from a template
"skelpro cleanup <worktree>"| Remove a Git worktree
"skelpro --help"| Display available commands

---

Common Options

Option| Description
"-i, --install"| Install dependencies after scaffolding
"-w, --worktree"| Create the project as a Git worktree
"-b, --branch <name>"| Specify the Git branch name for a worktree
"-v, --version"| Show the installed SkelPro version

---

Working With Templates

Create a Template

Convert an existing project into a reusable template:

skelpro save my-template ./my-project

This creates a JSON template containing your project structure.

---

Create a Project

From a Local Template

skelpro create my-new-app ./my-template.json

From a Remote Template

skelpro create my-new-app https://raw.githubusercontent.com/user/repo/main/template.json

---

Git Worktrees for AI Agents

SkelPro supports Git worktrees to create isolated environments for AI agents or parallel development.

Create a worktree with a custom branch:

skelpro create agent-1 ./template.json --worktree --branch agent-feature

Example:

skelpro create backend-agent ./template.json --worktree --branch agent-backend-fix

Each worktree receives its own Git branch, allowing multiple agents or developers to work independently.

Remove a completed worktree:

skelpro cleanup ./agent-1

---

Remote Template Requirements

Remote templates must:

- Return valid JSON.
- Follow the SkelPro template structure format.
- Be accessible through a direct URL.

Raw GitHub URLs are recommended:

https://raw.githubusercontent.com/user/repository/main/template.json

---

Update Notifications

SkelPro can notify users about new releases and important updates.

Update checks are cached to reduce unnecessary network requests and improve CLI performance.

---

Contributing

Contributions, improvements, and bug reports are welcome.

1. Read "CONTRIBUTING.md" (CONTRIBUTING.md).
2. Open an issue or submit a pull request.
3. Suggest new features and improvements.

Future versions may introduce additional AI-powered development workflows.

---

License

SkelPro is licensed under the Apache License 2.0.

See the "LICENSE" (LICENSE) file for details.
