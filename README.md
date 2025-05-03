# **SkelPro (Skeleton Project)**  
A fast and simple tool to set up your project structure in seconds.

## Introduction 📚  
Tired of starting every project from scratch? SkelPro helps you set up a clean and organized project structure using pre-defined templates stored in a JSON file.  
Whether you're starting something new or working on similar projects regularly, SkelPro saves you time and keeps your setup consistent.

## Features ✨  
- **JSON Templates**: Easily manage your project templates with a simple JSON file.  
- **Quick Project Setup**: Instantly scaffold a project with a predefined structure.  
- **Command Line Interface**: Simple CLI commands to get started fast.

## Installation 💻  
Install SkelPro globally via npm:

```bash
npm install -g skelpro
```

## Usage 🛠️  
To get started, run:

```bash
skelpro start
```

You’ll see a set of options in the command line. Choose what you need and follow the prompts.

<img src="./Snapshot.PNG" />

> **Note:** When using templates from a URL, make sure it returns raw JSON.  
A good example is:
```
https://raw.githubusercontent.com/<user>/<repo>/<branch>/file.json
```
Avoid links that return HTML or other formats — SkelPro expects proper JSON.

---

## CLI Command Overview  
```bash
skelpro [options] [command]
```

### Options  
| Option         | Description               |
| -------------- | ------------------------- |
| -i, --install  | Install dependencies      |
| -v, --version  | Show version              |
| -h, --help     | Show help                 |

### Commands  
| Command                                         | Description                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `start`                                        | Launches the main CLI interface                                        |
| `generate <templateName> <projectPath>`        | Saves a new reusable project template                                  |
| `create <projectName> <templatePath or URL>`   | Creates a project using a local or remote JSON template                |
| `help [command]`                                | Show help for a specific command                                       |

### Example (With Dependencies Installed)  
```bash
skelpro create -i <projectName> <templatePath>
```

---

## Contributing 🤝  
We’d love your help! To contribute, check out the [CONTRIBUTING](CONTRIBUTING.md) file for guidelines.

## License 📜  
Licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.
