# gemini-blog-build v2.0

A powerful, zero-dependency CLI tool that transforms Markdown files into a complete, static HTML blog. Built entirely with Google's Gemini CLI, `gemini-blog-build` offers simplicity without sacrificing extensibility.

## Features

`gemini-blog-build` now includes the following features:

-   **YAML Frontmatter Parsing**: Extract metadata like `title`, `date`, `tags`, and `author` from your Markdown files.
    ```markdown
    ---
    title: "My Awesome Post"
    date: 2025-06-26
    tags: [cli, static-site]
    author: Your Name
    ---

    This is the content of my post.
    ```
-   **RSS Feed Generation**: Automatically creates `dist/rss.xml` for easy content syndication.
-   **Custom Template Support**: Use a `template.html` file in your project root to customize the layout of your individual blog posts. Supports `{{title}}`, `{{content}}`, `{{prev}}`, and `{{next}}` placeholders.
-   **Config File Support (`blog.config.json`)**: Customize global settings like blog title, output directory, and template file.
    ```json
    {
      "title": "My AI-Built Blog",
      "outputDir": "public",
      "template": "my-template.html"
    }
    ```
-   **Basic Markdown Enhancements**: Supports:
    -   Headers (`#` to `######`)
    -   Bold (`**text**`)
    -   Italic (`*text*`)
    -   Auto-linking URLs
    -   Code blocks (fenced with ```` ``` ````, with optional language highlighting).
-   **Static Asset Copying**: Automatically copies all files and subdirectories from an `assets/` folder to your output directory.
-   **Build Watch Mode**: Run `blog-build --watch` to automatically rebuild your blog whenever changes are detected in the `posts/` directory.
-   **GitHub Pages Deployment Suggestion**: Use the `--github-pages` flag to generate a `.nojekyll` file and get a suggestion for deploying to GitHub Pages using `git subtree push`.
-   **CLI Flags**: Control the build process with flags:
    -   `--output <dir>`: Specify the output directory (overrides `blog.config.json`).
    -   `--watch`: Enable watch mode.
    -   `--github-pages`: Prepare for GitHub Pages deployment.
-   **Interactive CLI Setup Wizard**: Run `blog-build init` for a guided setup of your blog, including title, output directory, and template choice.

## Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/bighippoman/gemini-blog-build.git
    cd gemini-blog-build
    ```
2.  **Install globally (recommended)**:
    ```bash
    sudo npm link
    ```
    (You might need `sudo` depending on your npm setup.)

## Usage

### Initialize Your Blog

For the first-time setup, run the interactive wizard:

```bash
blog-build init
```

This will guide you through setting up your `blog.config.json`, `posts/` directory, and `template.html`.

### Build Your Blog

To build your blog, simply run:

```bash
blog-build
```

Or, if you've configured a different posts directory:

```bash
blog-build my-posts-folder
```

### Watch for Changes

To automatically rebuild your blog when Markdown files change:

```bash
blog-build --watch
```

### Deploy to GitHub Pages

Build your blog and prepare it for GitHub Pages:

```bash
blog-build --github-pages
```

After building, you'll see a suggestion to push your `dist` folder to the `gh-pages` branch.

## Project Structure

```
. # Project root
├── blog.config.json  # Configuration file
├── index.js          # The main CLI tool
├── package.json
├── posts/            # Your Markdown blog posts
│   ├── first-post.md
│   └── second-post.md
├── assets/           # Optional: Static assets (images, CSS, etc.)
│   └── my-image.png
└── template.html     # Optional: Custom HTML template for posts

# After build:
└── dist/             # Generated static site
    ├── index.html
    ├── first-post.html
    ├── second-post.html
    ├── rss.xml
    ├── .nojekyll     # (if --github-pages used)
    └── my-image.png  # (if assets/ used)
```