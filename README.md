# gemini-blog-build
# 🪄 Gemini Blog Build

**Gemini Blog Build** is a zero-dependency Node.js CLI tool that converts Markdown files into a static HTML blog — complete with navigation, styling, and a homepage. It was created entirely using [Google’s Gemini CLI](https://github.com/google-gemini/gemini-cli), from a single prompt.

No frameworks, no libraries, no nonsense.

---

## ✨ Features

- ⚙️ **Zero dependencies** — Uses only built-in Node.js modules (`fs`, `path`, `http`)
- 📝 **Markdown-to-HTML** — Parses `.md` files and converts them to individual HTML pages
- 🧭 **Auto-generated homepage** — Creates `index.html` with links to each post
- ↔️ **Previous/Next navigation** — Each post has navigation links
- 🎨 **Inline styling** — Fully self-contained HTML, no external CSS
- 📁 **Output to `dist/`** — All generated files go in a clean `dist/` folder
- 🧠 **Built by Gemini CLI** — Prompt-to-code magic

---

## 📦 Installation

```bash
npm install -g gemini-blog-build 
```
# 🧪 Usage
1. Create a folder of .md files, e.g. posts/
2. Run:
```bash
blog-build posts/
```
3.	Your blog will be generated in the dist/ folder.

## 🗂 Example Structure
```bash
posts/
├── first-post.md
├── second-post.md

dist/
├── index.html
├── first-post.html
├── second-post.html
```
📄 Sample Markdown File:
```bash
---
title: My First Post
date: 2025-06-26
---
```
Welcome to my first blog post generated entirely by AI.

## 🧠 How It Was Built
--- “Create a zero-dependency CLI tool in Node.js that converts Markdown files to HTML pages, adds navigation, and outputs everything to a dist/ folder.”
Prompt was typed directly into Gemini CLI. No edits required.

## 🔧 Development
To test locally:
```bash
npm install
node index.js posts/
```
To link globally for CLI use:
```bash
sudo npm link
blog-build posts/
```

## Command Reference
```bash
blog-build posts/
```
- Accepts a relative or absolute path to a folder containing .md files
- Outputs .html files and index.html to the dist/ folder

## License

MIT © Joseph Nordqvist
Built with help from Gemini CLI.


