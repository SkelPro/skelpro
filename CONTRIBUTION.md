# Contributing to SkelPro 🚀

Thank you for your interest in contributing to **SkelPro**! 🎉  
SkelPro is an open-source **template scaffolding tool**, and we appreciate all contributions—whether it's fixing bugs, adding features, improving documentation, or suggesting ideas.  

Here’s a well-structured **`CONTRIBUTING.md`** file for **SkelPro**:

---

## 📌 Ways to Contribute  

### 🐛 Report Issues  
If you encounter a bug, unexpected behavior, or have a feature request, please open an [issue](https://github.com/your-username/skelpro/issues) and include:  
- **A clear title and description** of the problem.  
- **Steps to reproduce** (if applicable).  
- **Error messages or logs** (if available).  

### 🛠️ Submit Code Contributions  
Want to improve SkelPro? Follow the steps below to submit a **pull request (PR)**.  

### 📖 Improve Documentation  
If you spot outdated or missing information in the docs, feel free to update the **README** or this file!  

---

## 🖥️ Setting Up the Development Environment  

### 🔧 Prerequisites  
Before contributing, ensure you have:  
- **Node.js** (LTS recommended)  
- **Git** installed on your machine  
- Good knowledge on **Typescript** & **Git**.

### 📥 Installation  
Clone the repository and install dependencies:  
```sh
git clone https://github.com/your-username/skelpro.git
cd skelpro
npm install
```

### ▶️ Running SkelPro Locally  
To run SkelPro locally, follow these steps:

**1.** Compile the code by running: `npm run build` or typing `tsc` in the Terminal.

**2.** Create a **package.json** file for the build with the following content:

```json
{
    "name": "skelpro",
    "version": "1.3.4",
    "main": "./dist/src/index.js",
    "description": "SkelPro – where projects get their bones structured.",
    "bin": {
        "skelpro": "dist/cli.js"
    },
    "dependencies": {
        "axios": "^1.7.9",
        "cheerio": "^1.0.0",
        "commander": "^13.0.0",
        "inquirer": "^12.3.0",
        "json5": "^2.2.3",
        "node-fetch": "^3.3.2",
        "ora": "^5.4.1",
        "tonelog": "^2.0.7",
        "typeglide": "^1.2.3"
    },
    "devDependencies": {
        "@types/express": "^5.0.0",
        "@types/inquirer": "^9.0.7",
        "@types/node": "^22.10.5",
        "@types/node-fetch": "^2.6.12",
        "ts-node": "^10.9.2",
        "typescript": "^5.7.2"
    }
}
```

**3.** To test your changes, run:  
```sh
cd package_module
npm link
skelpro --help
```

And that's it.

### ✅ Running Tests  
Ensure all tests pass before submitting a PR:  
```sh
npm test
```

---

## 🚀 Contribution Workflow  

### 1️⃣ Fork the Repository  
Click the **Fork** button on the repository page.  

### 2️⃣ Clone Your Fork  
```sh
git clone https://github.com/your-username/skelpro.git
cd skelpro
```

### 3️⃣ Create a New Branch  
```sh
git checkout -b feature-name
```

### 4️⃣ Make Your Changes  
Modify the code, add features, or fix bugs.  

### 5️⃣ Commit Your Changes  
Write meaningful commit messages:  
```sh
git add .
git commit -m "feat: Add support for XYZ"
```

### 6️⃣ Push to Your Fork  
```sh
git push origin feature-name
```

### 7️⃣ Open a Pull Request (PR)  
- Go to the **Pull Requests** tab in the main repository.  
- Click **New Pull Request**.  
- Select your branch and provide a **clear description** of your changes.  

---

## 📜 Code Guidelines  

### ✅ Code Style  
- Follow **Prettier** and **ESLint** rules.  
- Use **descriptive variable and function names**.  
- Keep code **modular and reusable**.  

### 📂 File Structure  
- Organize files logically within the project.  
- Follow existing **folder conventions**.  

### ✏️ Commit Message Format  
Use the following format:  
```sh
feat: Add support for XYZ  
fix: Resolve bug in ABC  
docs: Update README for clarity  
```

---

## 📌 Pull Request Guidelines  
Before submitting a PR:  
- Ensure your branch is **up to date** with `main`.  
- Run all **tests** and fix any issues.  
- Provide a **clear PR description** and link related issues.  

---

## 💬 Getting Help  
If you need help:  
- Check the **Discussions** tab on GitHub.  
- Open an issue if something is unclear.  

---

## ⚖️ License  
By contributing, you agree that your code will be licensed under the **Apache License**.  

---

Thank you for helping improve SkelPro! 💙 Happy coding! 🚀