# **Skeleton Project (SkelPro)**

SkelPro is a fast and simple CLI tool for creating and setting up a project structure. It uses pre-defined templates stored in a JSON file to create and organize project structure.

Whether you're starting something new or working on similar projects regularly, SkelPro saves you time and keeps your setup consistent.


<!-- ## Introduction 📚   -->


## Features ✨  
- **JSON Templates:** Easily manage your project templates with a simple JSON file.  
- **Quick Setup:** Instantly scaffold a project with a predefined structure.  
- **Simple CLI:** Clean interface and simple CLI commands to get started fast.
- **Transparency:** Clearly see what's in the template.

## Installation 💻  
Install **SkelPro** globally via npm:

```bash
npm install -g skelpro
```

## Usage 🛠️  
To launch SkelPro's interface - run:

```bash
skelpro launch
```

You’ll see a set of options in the command line. Choose what you need and follow the prompts as shown below:

<img src="./Snapshot.PNG" />

<br/>

> **Note:** If you want to fetch a remote template, use a URL that returns raw JSON data. Avoid links that return HTML or other formats; SkelPro expects proper JSON..

A good example is **Github raw user content**:
```
https://raw.githubusercontent.com/<user>/<repo>/<branch>/file.json
```

---

### CLI Command Overview  
```bash
skelpro [options] [command]
```

#### Options  
| Option         | Description               |
| -------------- | ------------------------- |
| -i, --install  | Install dependencies      |
| -v, --version  | Show version              |
| -h, --help     | Show help                 |

#### Commands:
The below are the CLI commands SkelPro supports and their usage.
| Command                                         | Usage                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `launch`                                        | Launches the main CLI interface                                        |
| `save <templateName> <projectPath>`        | Saves a new reusable project template in a JSON file                                  |
| `create <projectName> <templatePath (or) URL>`   | Creates a project using a local or remote JSON template                |
| `help [command]`                                | Show help for a specific command                                       |


## Contributing 🤝  
We’d love your help! To contribute, check out the [CONTRIBUTING](CONTRIBUTING.md) file for guidelines.

## License 📜  
Licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

