# Skeleton Project (SkelPro) 💀

SkelPro helps developers create consistent project structures quickly using reusable templates.

## Sentencified Overview

> Note: This document uses the Sentencification technique, a proposed technical writing pattern for creating sentence-level overviews that improve document comprehension. Learn more: https://open.substack.com/pub/sydney2o5/p/introducing-sentencification-a-new

1. SkelPro is a command-line tool that generates complete project structures from JSON templates.
2. Developers define project structures using simple JSON template files.
3. SkelPro reads these templates and automatically creates folders and files.
4. Existing projects can be converted into reusable templates.
5. Projects can be generated from local templates or remote templates hosted online.
6. SkelPro supports Git worktrees for isolated AI agent environments and parallel development.
7. Each worktree can have its own custom Git branch.
8. SkelPro initializes independent Git repositories for generated projects.
9. Interactive prompts and command-line options support different project creation workflows.
10. Dependencies can be installed automatically after project generation.
11. Temporary files, dependencies, and build outputs are ignored when creating templates.
12. SkelPro provides update notifications for new releases.
13. Developers can contribute improvements through the contribution guidelines.
14. SkelPro is licensed under the Apache License 2.0.

---

# Overview

SkelPro is a fast command-line tool that creates project structures from reusable JSON templates.

It helps developers avoid repetitive setup tasks by generating consistent development environments in seconds.

With built-in Git worktree support, SkelPro also enables developers and AI agents to work on isolated branches without interfering with the main project.

---

# Features

- **JSON Templates** — Define complete project structures using simple JSON files.
- **Quick Scaffolding** — Generate folders and files instantly from templates.
- **Interactive Mode** — Guided prompts for common project setup workflows.
- **Remote Templates** — Fetch templates from online sources such as GitHub raw URLs.
- **Independent Git Projects** — Generated projects are initialized with their own Git repositories.
- **Git Worktree Support** — Create isolated environments for AI agents or parallel development.
- **Custom Agent Branches** — Assign unique Git branches to worktrees.
- **Dependency Installation** — Automatically install project dependencies after generation.
- **Smart Ignoring** — Skip temporary files, dependencies, and build directories when creating templates.
- **Worktree Cleanup** — Safely remove completed agent environments and clean Git references.
- **Update Notifications** — Receive information about new SkelPro releases.

---

# Installation

Install SkelPro globally using npm:

```bash
npm install -g skelpro

Prerequisite: Node.js version 18 or higher is required.


---

Basic Usage

Start the interactive interface:

skelpro launch

SkelPro displays available actions and guides users through common workflows.


---

Available Commands

Command	Description

skelpro launch	Start the interactive CLI interface
skelpro save <name> <path>	Save an existing project as a reusable JSON template
skelpro create <project> <template>	Generate a project from a template
skelpro cleanup <repoPath> <worktreePath>	Remove a Git worktree and clean related references
skelpro --help	Display available commands



---

Common Options

Option	Description

-i, --install	Install dependencies after scaffolding
-w, --worktree	Create an isolated Git worktree environment
-b, --branch <name>	Specify the Git branch name for a worktree
-v, --version	Show the installed SkelPro version



---

Working With Templates

Create a Template

Convert an existing project into a reusable template:

skelpro save my-template ./my-project

This creates a JSON template containing the project's structure.


---

Create a Project

From a Local Template

skelpro create my-new-app ./my-template.json

From a Remote Template

skelpro create my-new-app https://raw.githubusercontent.com/user/repository/main/template.json

After creation, SkelPro initializes the generated project as an independent Git repository.


---

Git Worktrees for AI Agents

SkelPro supports Git worktrees for creating isolated environments for AI agents and parallel development.

When a worktree is created, SkelPro:

1. Creates the project structure.


2. Initializes a Git repository.


3. Creates the requested branch.


4. Creates a separate worktree environment.



Example:

skelpro create backend-agent ./template.json --worktree --branch agent-backend-fix

This creates:

backend-agent/
├── .git/
└── project files

backend-agent-agent-backend-fix/
└── isolated worktree

Each worktree has its own Git branch, allowing multiple agents or developers to work independently.


---

Removing a Worktree

Remove a completed worktree:

skelpro cleanup ./backend-agent ./backend-agent-agent-backend-fix --branch agent-backend-fix

This will:

Remove the Git worktree.

Clean stale Git worktree references.

Remove the associated branch.

Delete leftover files.



---

Remote Template Requirements

Remote templates must:

Return valid JSON.

Follow the SkelPro template structure format.

Be accessible through a direct URL.


Recommended format:

https://raw.githubusercontent.com/user/repository/main/template.json


---

Update Notifications

SkelPro can notify users about new releases and important updates.

Update checks are cached to reduce unnecessary network requests and improve CLI performance.


---

Contributing

Contributions, improvements, and bug reports are welcome.

1. Read CONTRIBUTING.md.


2. Open an issue or submit a pull request.


3. Suggest new features and improvements.



Future versions may introduce additional AI-powered development workflows.


---

License

SkelPro is licensed under the Apache License 2.0.

See the LICENSE file for details.
```
