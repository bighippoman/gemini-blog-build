# gemini-blog-build v4.2

A powerful, zero-dependency CLI tool that transforms Markdown files into a complete, static HTML blog. Built entirely with Google's Gemini CLI, `gemini-blog-build` offers simplicity without sacrificing extensibility.

## Features

`gemini-blog-build` now includes the following features:

-   **Theming System**: Easily switch between themes by setting the `theme` property in `blog.config.json`. Themes are located in the `themes/` directory and can contain their own `template.html`, `homepage-template.html`, and `style.css`. Root-level files override theme files for granular control.
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
-   **Custom Template Support**: Use a `template.html` file in your project root or selected theme to customize the layout of your individual blog posts. Supports `{{title}}`, `{{content}}`, `{{prev}}`, and `{{next}}` placeholders.
-   **Homepage Template**: Customize the `index.html` layout using `homepage-template.html` with `{{blogTitle}}`, `{{postsList}}`, and `{{pagination}}` placeholders.
-   **Partial Templates**: Include reusable HTML snippets within templates using `{{include filename.html}}`.
-   **Config File Support (`blog.config.json`)**: Customize global settings like blog title, output directory, and template file.
    ```json
    {
      "title": "My AI-Built Blog",
      "outputDir": "public",
      "template": "my-template.html"
    }
    ```
-   **Advanced Markdown Enhancements**: Supports:
    -   Headers (`#` to `######`)
    -   Bold (`**text**`)
    -   Italic (`*text*`)
    -   Auto-linking URLs
    -   Code blocks (fenced with ```` ``` ````, with optional language highlighting).
    -   Tables
    -   Images (`![alt text](url)`)
    -   Blockquotes (`> `)
    -   Lists (ordered `1.`, `2.`, and unordered `-`, `*`)
    -   Footnotes (`[^1]`, `[^1]: Definition`)
    -   Definition Lists (`Term : Definition`)
    -   Admonitions/Callouts (`> [!NOTE] Title`)
    -   Strikethrough (`~~text~~`)
    -   Inline Code (`` `code` ``)
    -   Horizontal Rules (`---`, `***`, `___`)
    -   Improved Nested Lists
    -   Better Paragraph Handling
-   **Basic Syntax Highlighting (Zero-Dependency)**: Basic regex-based syntax highlighting for code blocks.
-   **Shortcodes / Custom Components**: Embed reusable content like YouTube videos or custom quotes.
    ```markdown
    {{ youtube videoId="dQw4w9WgXcQ" }}
    {{ quote author="Albert Einstein" }}Imagination is more important than knowledge.{{ /quote }}
    ```
-   **Theming & Basic Design System**: Configure primary color, font family, and heading sizes in `blog.config.json` to generate a `style.css`.
-   **Static Asset Copying**: Automatically copies all files and subdirectories from an `assets/` folder to your output directory.
-   **Build Watch Mode**: Run `blog-build --watch` to automatically rebuild your blog whenever changes are detected in the `posts/` directory.
-   **GitHub Pages Deployment Suggestion**: Use the `--github-pages` flag to generate a `.nojekyll` file and get a suggestion for deploying to GitHub Pages using `git subtree push`.
-   **CLI Flags**: Control the build process with flags:
    -   `--output <dir>`: Specify the output directory (overrides `blog.config.json`).
    -   `--watch`: Enable watch mode.
    -   `--github-pages`: Prepare for GitHub Pages deployment.
    -   `--clean`: Clean the output directory before building.
    -   `--serve`: Start a local development server to preview the blog.
-   **Interactive CLI Setup Wizard**: Run `blog-build init` for a guided setup of your blog, including title, output directory, and template choice.
-   **Post Creation Wizard (`blog-build new`)**: Interactively create new Markdown files with pre-filled frontmatter, suggesting existing tags, and offering to open the file in an editor.
-   **Tag/Category Pages**: Automatically generates dedicated HTML pages for each unique tag found in post frontmatter.
-   **Search Index Generation**: Creates a `search-index.json` file in the output directory for client-side search implementations.
-   **Incremental Builds**: Only re-processes changed Markdown files, significantly speeding up subsequent builds.
-   **Draft Posts**: Exclude posts from the final build by adding `draft: true` to their frontmatter.
-   **Related Posts**: Displays a list of related posts based on shared tags at the bottom of each post.
-   **Dynamic Tag Cloud/List**: Generates a list of all tags used in the blog, with links to their respective tag pages.
-   **Pagination for Content Listings**: Paginate homepage and tag/category pages with configurable posts per page.
-   **Customizable Permalinks**: Define custom URL structures for posts (e.g., `/:year/:month/:slug.html`).
-   **Favicon Support**: Automatically copies favicon files and adds necessary `<link>` tags.
-   **Draft Preview Mode**: Includes posts marked as `draft: true` only when running the local development server (`--serve`).
-   **Post Excerpts**: Use an optional `excerpt` field in frontmatter for content listings.
-   **Meta Tags from Frontmatter**: Generates HTML `<meta>` tags from post frontmatter for SEO.
-   **Table of Contents Generation**: Automatically generates a TOC for posts based on headings.
-   **Sitemap Generation**: Automatically generates a `sitemap.xml` file.
-   **`blog-build help` Command**: Provides a clear overview of all commands and flags.
-   **`blog-build config` Command**: Displays current configuration settings.

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

### Create a New Post

Interactively create a new Markdown file with pre-filled frontmatter:

```bash
blog-build new
```

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

### Start a Local Development Server

To preview your blog locally:

```bash
blog-build --serve
```

### Clean Build

To clean the output directory before building:

```bash
blog-build --clean
```

### Deploy to GitHub Pages

Build your blog and prepare it for GitHub Pages:

```bash
blog-build --github-pages
```

After building, you'll see a suggestion to push your `dist` folder to the `gh-pages` branch.

### Display Help

To see all available commands and options:

```bash
blog-build help
```

### View Configuration

To view the current `blog.config.json` settings:

```bash
blog-build config
```

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
├── themes/           # Optional: Custom themes
│   └── my-theme/
│       ├── template.html
│       ├── homepage-template.html
│       └── style.css
├── template.html     # Optional: Custom HTML template for posts (overrides theme)
└── homepage-template.html # Optional: Custom HTML template for the homepage (overrides theme)

# After build:
└── dist/             # Generated static site
    ├── index.html
    ├── first-post.html
    ├── second-post.html
    ├── rss.xml
    ├── search-index.json
    ├── sitemap.xml
    ├── tags/             # Tag pages
    │   └── cli.html
    ├── .nojekyll         # (if --github-pages used)
    └── my-image.png      # (if assets/ used)
```