#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const http = require('http');
const { exec } = require('child_process');

const defaultConfig = {
    title: "My AI-Built Blog",
    outputDir: "dist",
    template: "template.html",
    homepageTemplate: "homepage-template.html",
    includeTags: true, // Default to true for tag pages
    postsPerPage: 5, // Default for pagination
    permalink: "/:slug.html", // Default permalink structure
    theme: "default", // New: Default theme
    designTokens: { // Default design tokens
        primaryColor: "#007bff",
        fontFamily: "sans-serif",
        h1Size: "2em",
        h2Size: "1.5em",
        h3Size: "1.17em",
        h4Size: "1em",
        h5Size: "0.83em",
        h6Size: "0.67em"
    }
};

let config = defaultConfig;
const configPath = 'blog.config.json';
const buildCachePath = '.build-cache.json';

// Load config (or create default if not exists)
if (fs.existsSync(configPath)) {
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config = { ...defaultConfig, ...userConfig };
} else {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
}

// Parse CLI arguments
const args = process.argv.slice(2);
let postsDir = 'posts';
let watchMode = false;
let githubPages = false;
let initMode = false;
let cleanBuild = false;
let serveMode = false;
let newPostMode = false;
let configMode = false;
let helpMode = false;

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--output' && args[i + 1]) {
        config.outputDir = args[++i];
    } else if (arg === '--watch') {
        watchMode = true;
    } else if (arg === '--github-pages') {
        githubPages = true;
    } else if (arg === 'init') {
        initMode = true;
    } else if (arg === '--clean') {
        cleanBuild = true;
    } else if (arg === '--serve') {
        serveMode = true;
    } else if (arg === 'new') {
        newPostMode = true;
    } else if (arg === 'config') {
        configMode = true;
    } else if (arg === '--help' || arg === '-h') {
        helpMode = true;
    } else if (!arg.startsWith('--')) {
        postsDir = arg; // Assume the first non-flag argument is the posts directory
    }
}

const distDir = config.outputDir;
const assetsDir = 'assets';

let lastBuildTime = Date.now(); // Track last build time for live reload

// Function to copy files/directories recursively
function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest);
        }
        fs.readdirSync(src).forEach(function(item) {
            copyRecursiveSync(path.join(src, item), path.join(dest, item));
        });
    } else if (exists) {
        fs.copyFileSync(src, dest);
    }
}

// Function to handle template includes
function processIncludes(htmlContent) {
    return htmlContent.replace(/{{include\s+(.*?)\s*}}/g, (match, filename) => {
        const includePath = path.join(process.cwd(), filename);
        if (fs.existsSync(includePath)) {
            return fs.readFileSync(includePath, 'utf-8');
        } else {
            console.warn(`Warning: Include file not found: ${filename}`);
            return '';
        }
    });
}

// Function to process shortcodes
function processShortcodes(content) {
    // Example: {{ youtube videoId="abc" }}
    content = content.replace(/{{ youtube videoId="(.*?)" }}/g, '<iframe width="560" height="315" src="https://www.youtube.com/embed/$1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>');

    // Example: {{ quote author="Jane Doe" }}Content here{{ /quote }}
    content = content.replace(/{{ quote author="(.*?)" }}(.*?){{ \/quote }}/gs, '<blockquote class="shortcode-quote"><p>$2</p><cite>— $1</cite></blockquote>');

    return content;
}

// Basic Syntax Highlighting (Zero-Dependency)
function highlightCode(code, lang) {
    // Very basic highlighting for common languages
    let highlightedCode = code;

    // Keywords (example for JavaScript)
    const keywords = ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'new', 'this', 'true', 'false', 'null', 'undefined'];
    keywords.forEach(kw => {
        highlightedCode = highlightedCode.replace(new RegExp(`\\b${kw}\\b`, 'g'), `<span class="keyword">${kw}</span>`);
    });

    // Strings
    highlightedCode = highlightedCode.replace(/("|')(.*?)\1/g, `<span class="string">$1$2$1</span>`);

    // Comments
    highlightedCode = highlightedCode.replace(/\/\/(.*)/g, `<span class="comment">//$1</span>`);
    highlightedCode = highlightedCode.replace(/\/\*[\s\S]*?\*\//g, `<span class="comment">$&</span>`);

    // Numbers
    highlightedCode = highlightedCode.replace(/\b\d+(\.\d+)?\b/g, `<span class="number">$&</span>`);

    return highlightedCode;
}

// Enhanced Markdown to HTML conversion
function mdToHtml(md) {
    let html = [];
    const lines = md.split('\n');
    let inCodeBlock = false;
    let codeLang = '';
    let codeContent = [];
    let inTable = false;
    let tableHeader = [];
    let tableRows = [];
    let inBlockquote = false;
    let inUnorderedList = false;
    let inOrderedList = false;
    let inDefinitionList = false;
    let inAdmonition = false;
    let footnotes = {};
    let currentParagraph = [];

    // First pass for footnotes definitions
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const footnoteMatch = line.match(/^\s*\[\^(\d+)\]:\s*(.*)/);
        if (footnoteMatch) {
            footnotes[footnoteMatch[1]] = footnoteMatch[2].trim();
            lines[i] = ''; // Remove footnote definition from content
        }
    }

    const processParagraph = () => {
        if (currentParagraph.length > 0) {
            let pContent = currentParagraph.join(' ');
            // Apply inline formatting before wrapping in <p>
            pContent = pContent.replace(/~~(.*?)~~/g, '<del>$1</del>'); // Strikethrough
            pContent = pContent.replace(/`(.*?)`/g, '<code>$1</code>'); // Inline code
            pContent = pContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold
            pContent = pContent.replace(/\*(.*?)\*/g, '<em>$1</em>');     // Italic
            pContent = pContent.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>'); // Auto-link URLs
            pContent = pContent.replace(/!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)/g, (match, alt, src, caption) => {
                let imgTag = `<img alt="${alt}" src="${src}">`;
                if (caption) {
                    return `<figure>${imgTag}<figcaption>${caption}</figcaption></figure>`;
                } else {
                    return imgTag;
                }
            });
            // Footnote references
            pContent = pContent.replace(/\[\^(\d+)\]/g, (match, fnId) => {
                if (footnotes[fnId]) {
                    return `<sup><a href="#fn${fnId}" id="fnref${fnId}">${fnId}</a></sup>`;
                } else {
                    return match; // Keep original if footnote not defined
                }
            });
            html.push(`<p>${pContent}</p>`);
            currentParagraph = [];
        }
    };

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let trimmedLine = line.trim();

        // Code block detection
        if (line.startsWith('```')) {
            processParagraph();
            if (inCodeBlock) {
                html.push(`<pre><code class="language-${codeLang}">${highlightCode(codeContent.join('\n'), codeLang)}</code></pre>`);
                inCodeBlock = false;
                codeLang = '';
                codeContent = [];
            } else {
                inCodeBlock = true;
                codeLang = line.substring(3).trim();
            }
            continue;
        }

        if (inCodeBlock) {
            codeContent.push(line);
            continue;
        }

        // Horizontal Rule
        if (trimmedLine === '---' || trimmedLine === '***' || trimmedLine === '___') {
            processParagraph();
            html.push('<hr>');
            continue;
        }

        // Admonition detection
        const admonitionMatch = trimmedLine.match(/^>\s*\[!(NOTE|TIP|WARNING|DANGER)\]\s*(.*)/);
        if (admonitionMatch) {
            processParagraph();
            if (inAdmonition) {
                html.push('</div>'); // Close previous admonition
            }
            inAdmonition = true;
            const type = admonitionMatch[1].toLowerCase();
            const title = admonitionMatch[2].trim();
            html.push(`<div class="admonition ${type}"><p class="admonition-title">${title}</p>`);
            continue;
        } else if (inAdmonition && !trimmedLine.startsWith('>')) {
            html.push('</div>'); // Close admonition if line doesn't start with >
            inAdmonition = false;
        }

        if (inAdmonition) {
            html.push(`<p>${trimmedLine.substring(1).trim()}</p>`);
            continue;
        }

        // Table detection
        if (line.includes('|') && line.trim().startsWith('|') && !inTable) {
            processParagraph();
            // Check for header separator line
            if (lines[i + 1] && lines[i + 1].includes('|') && lines[i + 1].trim().startsWith('|') && lines[i + 1].includes('---')) {
                inTable = true;
                tableHeader = line.split('|').map(s => s.trim()).filter(s => s !== '');
                i++; // Skip separator line
                continue;
            }
        }

        if (inTable) {
            if (line.includes('|') && line.trim().startsWith('|')) {
                tableRows.push(line.split('|').map(s => s.trim()).filter(s => s !== ''));
            } else {
                // End of table
                let tableHtml = '<table><thead><tr>';
                tableHeader.forEach(header => tableHtml += `<th>${header}</th>`);
                tableHtml += '</tr></thead><tbody>';
                tableRows.forEach(row => {
                    tableHtml += '<tr>';
                    row.forEach(cell => tableHtml += `<td>${cell}</td>`);
                    tableHtml += '</tr>';
                });
                tableHtml += '</tbody></table>';
                html.push(tableHtml);
                inTable = false;
                tableHeader = [];
                tableRows = [];
            }
        }

        if (inTable) continue; // Skip processing if still in table

        // Blockquote detection
        if (trimmedLine.startsWith('>')) {
            processParagraph();
            if (!inBlockquote) {
                html.push('<blockquote>');
                inBlockquote = true;
            }
            html.push(`<p>${trimmedLine.substring(1).trim()}</p>`);
            continue;
        } else if (inBlockquote && !trimmedLine.startsWith('>')) {
            html.push('</blockquote>');
            inBlockquote = false;
        }

        // List detection (unordered)
        if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
            processParagraph();
            const indent = line.match(/^\s*/)[0].length;
            const tag = 'ul';
            const item = `<li>${trimmedLine.substring(1).trim()}</li>`;
            // Basic nested list handling (can be improved)
            if (inUnorderedList && indent > lines[i-1].match(/^\s*/)[0].length) {
                html.push(`<ul>${item}`);
            } else if (inUnorderedList && indent < lines[i-1].match(/^\s*/)[0].length) {
                html.push(`</ul>${item}`);
            } else if (!inUnorderedList) {
                html.push(`<ul>${item}`);
                inUnorderedList = true;
            } else {
                html.push(item);
            }
            continue;
        } else if (inUnorderedList) {
            html.push('</ul>');
            inUnorderedList = false;
        }

        // List detection (ordered)
        if (trimmedLine.match(/^\d+\./)) {
            processParagraph();
            const indent = line.match(/^\s*/)[0].length;
            const item = `<li>${trimmedLine.substring(trimmedLine.indexOf('.') + 1).trim()}</li>`;
            // Basic nested list handling (can be improved)
            if (inOrderedList && indent > lines[i-1].match(/^\s*/)[0].length) {
                html.push(`<ol>${item}`);
            } else if (inOrderedList && indent < lines[i-1].match(/^\s*/)[0].length) {
                html.push(`</ol>${item}`);
            } else if (!inOrderedList) {
                html.push(`<ol>${item}`);
                inOrderedList = true;
            } else {
                html.push(item);
            }
            continue;
        } else if (inOrderedList) {
            html.push('</ol>');
            inOrderedList = false;
        }

        // Definition List detection
        const defListMatch = trimmedLine.match(/^(.*?)\s*:\s*(.*)$/);
        if (defListMatch) {
            processParagraph();
            if (!inDefinitionList) {
                html.push('<dl>');
                inDefinitionList = true;
            }
            html.push(`<dt>${defListMatch[1].trim()}</dt><dd>${defListMatch[2].trim()}</dd>`);
            continue;
        } else if (inDefinitionList) {
            html.push('</dl>');
            inDefinitionList = false;
        }

        // Headers
        if (line.startsWith('######')) {
            processParagraph();
            html.push(`<h6>${line.substring(6).trim()}</h6>`);
        } else if (line.startsWith('#####')) {
            processParagraph();
            html.push(`<h5>${line.substring(5).trim()}</h5>`);
        } else if (line.startsWith('####')) {
            processParagraph();
            html.push(`<h4>${line.substring(4).trim()}</h4>`);
        } else if (line.startsWith('###')) {
            processParagraph();
            html.push(`<h3>${line.substring(3).trim()}</h3>`);
        } else if (line.startsWith('##')) {
            processParagraph();
            html.push(`<h2>${line.substring(2).trim()}</h2>`);
        } else if (line.startsWith('#')) {
            processParagraph();
            html.push(`<h1>${line.substring(1).trim()}</h1>`);
        } else if (line.trim() === '') {
            processParagraph(); // End current paragraph on empty line
        } else {
            currentParagraph.push(line);
        }
    }

    processParagraph(); // Process any remaining paragraph content

    // Close any open tags at the end of the file
    if (inTable) {
        let tableHtml = '<table><thead><tr>';
        tableHeader.forEach(header => tableHtml += `<th>${header}</th>`);
        tableHtml += '</tr></thead><tbody>';
        tableRows.forEach(row => {
            tableHtml += '<tr>';
            row.forEach(cell => tableHtml += `<td>${cell}</td>`);
            tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table>';
        html.push(tableHtml);
    }
    if (inBlockquote) {
        html.push('</blockquote>');
    }
    if (inUnorderedList) {
        html.push('</ul>');
    }
    if (inOrderedList) {
        html.push('</ol>');
    }
    if (inDefinitionList) {
        html.push('</dl>');
    }
    if (inAdmonition) {
        html.push('</div>');
    }

    // Add footnote definitions at the end
    const footnoteKeys = Object.keys(footnotes).sort((a, b) => parseInt(a) - parseInt(b));
    if (footnoteKeys.length > 0) {
        html.push('<div class="footnotes"><ol>');
        footnoteKeys.forEach(key => {
            html.push(`<li id="fn${key}">${footnotes[key]} <a href="#fnref${key}" title="Return to content">&#8617;</a></li>`);
        });
        html.push('</ol></div>');
    }

    return html.join('\n');
}

// Simple YAML Frontmatter Parser
function parseFrontmatter(content) {
    const parts = content.split('---');
    if (parts.length >= 3 && parts[0].trim() === '') {
        const frontmatterStr = parts[1].trim();
        const markdownContent = parts.slice(2).join('---').trim();
        const metadata = {};
        frontmatterStr.split('\n').forEach(line => {
            const [key, value] = line.split(':').map(s => s.trim());
            if (key && value) {
                if (value.startsWith('[') && value.endsWith(']')) {
                    metadata[key] = value.substring(1, value.length - 1).split(',').map(s => s.trim());
                } else {
                    metadata[key] = value.replace(/^"|"$/g, ''); // Remove quotes if present
                }
            }
        });
        return { metadata, markdownContent };
    } else {
        return { metadata: {}, markdownContent: content };
    }
}

function buildBlog() {
    if (cleanBuild && fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
        console.log(`Cleaned ${distDir}`);
    }

    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir);
    }

    // Load build cache
    let buildCache = {};
    const cacheFilePath = path.join(distDir, buildCachePath);
    if (fs.existsSync(cacheFilePath)) {
        buildCache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
    }

    let filesToProcess = [];
    const currentMarkdownFiles = fs.readdirSync(postsDir).filter(file => file.endsWith('.md'));

    currentMarkdownFiles.forEach(file => {
        const filePath = path.join(postsDir, file);
        const stats = fs.statSync(filePath);
        const mtimeMs = stats.mtimeMs;

        if (!buildCache[file] || buildCache[file] < mtimeMs) {
            filesToProcess.push(file);
        }
    });

    // Remove deleted files from cache and dist
    for (const cachedFile in buildCache) {
        if (!currentMarkdownFiles.includes(cachedFile)) {
            const htmlFileName = cachedFile.replace('.md', '.html');
            const htmlFilePath = path.join(distDir, htmlFileName);
            if (fs.existsSync(htmlFilePath)) {
                fs.unlinkSync(htmlFilePath);
                console.log(`Deleted ${htmlFileName}`);
            }
            delete buildCache[cachedFile];
        }
    }

    // Determine theme paths
    const themeDir = path.join(process.cwd(), 'themes', config.theme);
    const themeTemplatePath = path.join(themeDir, 'template.html');
    const themeHomepageTemplatePath = path.join(themeDir, 'homepage-template.html');
    const themeStylePath = path.join(themeDir, 'style.css');

    let postTemplate = null;
    if (fs.existsSync(config.template)) { // Check root override first
        postTemplate = fs.readFileSync(config.template, 'utf-8');
    } else if (fs.existsSync(themeTemplatePath)) {
        postTemplate = fs.readFileSync(themeTemplatePath, 'utf-8');
    }

    let homepageTemplate = null;
    if (fs.existsSync(config.homepageTemplate)) { // Check root override first
        homepageTemplate = fs.readFileSync(config.homepageTemplate, 'utf-8');
    } else if (fs.existsSync(themeHomepageTemplatePath)) {
        homepageTemplate = fs.readFileSync(themeHomepageTemplatePath, 'utf-8');
    }

    let cssContent = '';
    if (fs.existsSync('style.css')) { // Check root override first
        cssContent = fs.readFileSync('style.css', 'utf-8');
    } else if (fs.existsSync(themeStylePath)) {
        cssContent = fs.readFileSync(themeStylePath, 'utf-8');
    } else {
        // Default CSS if no theme or override is found
        cssContent = `\n            body { font-family: ${config.designTokens.fontFamily}; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }\n            h1 { font-size: ${config.designTokens.h1Size}; color: ${config.designTokens.primaryColor}; }\n            h2 { font-size: ${config.designTokens.h2Size}; }\n            h3 { font-size: ${config.designTokens.h3Size}; }\n            h4 { font-size: ${config.designTokens.h4Size}; }\n            h5 { font-size: ${config.designTokens.h5Size}; }\n            h6 { font-size: ${config.designTokens.h6Size}; }\n            a { color: ${config.designTokens.primaryColor}; text-decoration: none; }\n            a:hover { text-decoration: underline; }\n            ul { list-style: none; padding: 0; }\n            li { margin-bottom: 1rem; }\n            .nav { display: flex; justify-content: space-between; margin-top: 2rem; }\n            /* Admonition styles */\n            .admonition { padding: 1em; margin: 1em 0; border-left: 4px solid; border-radius: 4px; }\n            .admonition-title { font-weight: bold; margin-top: 0; }\n            .admonition.note { border-color: #2196F3; background-color: #e3f2fd; }\n            .admonition.note .admonition-title { color: #2196F3; }\n            .admonition.tip { border-color: #4CAF50; background-color: #e8f5e9; }\n            .admonition.tip .admonition-title { color: #4CAF50; }\n            .admonition.warning { border-color: #FFC107; background-color: #fff8e1; }\n            .admonition.warning .admonition-title { color: #FFC107; }\n            .admonition.danger { border-color: #F44336; background-color: #ffebee; }\n            .admonition.danger .admonition-title { color: #F44336; }\n            /* Footnotes */\n            .footnotes { margin-top: 2em; padding-top: 1em; border-top: 1px solid #eee; font-size: 0.9em; }\n            .footnotes ol { padding-left: 1.5em; }\n            .footnotes li { margin-bottom: 0.5em; }\n            .footnotes li a { text-decoration: none; }\n            .footnotes li a:hover { text-decoration: underline; }\n            /* Tables */\n            table { border-collapse: collapse; width: 100%; margin: 1em 0; }\n            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }\n            th { background-color: #f2f2f2; }\n            /* Images with captions */\n            figure { margin: 1em 0; text-align: center; }\n            figure img { max-width: 100%; height: auto; display: block; margin: 0 auto; }\n            figcaption { font-size: 0.9em; color: #555; margin-top: 0.5em; }\n            /* Shortcodes */\n            .shortcode-quote { border-left: 4px solid #ccc; padding-left: 1em; margin: 1em 0; font-style: italic; }\n            .shortcode-quote cite { display: block; text-align: right; font-style: normal; color: #777; }\n            /* Syntax Highlighting */\n            pre { background-color: #eee; padding: 1em; overflow-x: auto; }\n            .keyword { color: #00f; }\n            .string { color: #a31515; }\n            .comment { color: #008000; }\n            .number { color: #f90; }\n        `;
    }
    fs.writeFileSync(path.join(distDir, 'style.css'), cssContent);

    // Copy assets before processing posts
    if (fs.existsSync(assetsDir)) {
        copyRecursiveSync(assetsDir, distDir);
    }

    // Favicon Support
    const faviconFiles = ['favicon.ico', 'favicon.png', 'apple-touch-icon.png'];
    faviconFiles.forEach(favicon => {
        const faviconPath = path.join(assetsDir, favicon);
        if (fs.existsSync(faviconPath)) {
            fs.copyFileSync(faviconPath, path.join(distDir, favicon));
        }
    });

    // Create .nojekyll file for GitHub Pages
    if (githubPages) {
        fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
    }

    const allPosts = fs.readdirSync(postsDir).filter(file => file.endsWith('.md'));

    const postData = allPosts.map(post => {
        const filePath = path.join(postsDir, post);
        const fullContent = fs.readFileSync(filePath, 'utf-8');
        const { metadata, markdownContent } = parseFrontmatter(fullContent);

        const title = metadata.title || markdownContent.split('\n')[0].replace(/#/g, '').trim();
        const slug = post.replace('.md', '');
        const dateObj = new Date(metadata.date);
        const year = dateObj.getFullYear();
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');

        let htmlFileName = config.permalink
            .replace(/:year/g, year)
            .replace(/:month/g, month)
            .replace(/:slug/g, slug);

        // Ensure .html extension if not present in permalink
        if (!htmlFileName.endsWith('.html') && !htmlFileName.endsWith('/')) {
            htmlFileName += '.html';
        } else if (htmlFileName.endsWith('/')) {
            htmlFileName += 'index.html';
        }

        return {
            htmlFileName,
            title,
            content: markdownContent,
            metadata
        };
    }).filter(post => !post.metadata.draft || serveMode) // Filter out draft posts unless in serve mode
    .sort((a, b) => new Date(b.metadata.date) - new Date(a.metadata.date)); // Sort by date, newest first

    postData.forEach((post, index) => {
        // Only re-write HTML for changed/new files
        const markdownFileName = post.htmlFileName.replace('.html', '.md');
        if (filesToProcess.includes(markdownFileName)) {
            const prevPost = index > 0 ? postData[index - 1] : null;
            const nextPost = index < postData.length - 1 ? postData[index + 1] : null;

            let htmlContent = mdToHtml(processShortcodes(post.content));
            let prevLink = prevPost ? `<a href="${prevPost.htmlFileName}">&laquo; ${prevPost.title}</a>` : '<span></span>';
            let nextLink = nextPost ? `<a href="${nextPost.htmlFileName}">${nextPost.title} &raquo;</a>` : '<span></span>';

            let finalHtml;
            if (postTemplate) {
                finalHtml = postTemplate
                    .replace(/{{title}}/g, post.title)
                    .replace(/{{content}}/g, htmlContent)
                    .replace(/{{prev}}/g, prevLink)
                    .replace(/{{next}}/g, nextLink);
                finalHtml = processIncludes(finalHtml); // Process includes in post template
            } else {
                finalHtml = `\n                    <!DOCTYPE html>\n                    <html lang="en">\n                    <head>\n                        <meta charset="UTF-8">\n                        <meta name="viewport" content="width=device-width, initial-scale=1.0">\n                        <title>${post.title}</title>\n                        <link rel="stylesheet" href="./style.css">\n                    </head>\n                    <body>\n                        <h1>${post.title}</h1>\n                        ${htmlContent}\n                        <div class="nav">\n                            ${prevLink}\n                            ${nextLink}\n                        </div>\n                    </body>\n                    </html>\n                `;
            }
            // Ensure directory exists for permalink structure
            const postOutputDir = path.join(distDir, path.dirname(post.htmlFileName));
            if (!fs.existsSync(postOutputDir)) {
                fs.mkdirSync(postOutputDir, { recursive: true });
            }
            fs.writeFileSync(path.join(distDir, post.htmlFileName), finalHtml);
        }

        // Update cache for processed file (even if not re-written, its metadata might be needed for global files)
        const stats = fs.statSync(path.join(postsDir, markdownFileName));
        buildCache[markdownFileName] = stats.mtimeMs;
    });

    // Pagination for Homepage
    const totalPages = Math.ceil(postData.length / config.postsPerPage);
    for (let page = 1; page <= totalPages; page++) {
        const startIndex = (page - 1) * config.postsPerPage;
        const endIndex = startIndex + config.postsPerPage;
        const paginatedPosts = postData.slice(startIndex, endIndex);

        const postsListHtml = paginatedPosts.map(post => `<li><a href="${post.htmlFileName}">${post.title}</a></li>`).join('');

        let paginationNav = '';
        if (totalPages > 1) {
            paginationNav += '<div class="pagination">';
            if (page > 1) {
                paginationNav += `<a href="${page === 2 ? 'index.html' : `index-${page - 1}.html`}">Previous Page</a>`;
            }
            paginationNav += `<span> Page ${page} of ${totalPages} </span>`;
            if (page < totalPages) {
                paginationNav += `<a href="index-${page + 1}.html">Next Page</a>`;
            }
            paginationNav += '</div>';
        }

        let indexHtml;
        if (homepageTemplate) {
            indexHtml = homepageTemplate
                .replace(/{{blogTitle}}/g, config.title)
                .replace(/{{postsList}}/g, postsListHtml)
                .replace(/{{pagination}}/g, paginationNav);
            indexHtml = processIncludes(indexHtml); // Process includes in homepage template
        } else {
            indexHtml = `\n                <!DOCTYPE html>\n                <html lang="en">\n                <head>\n                    <meta charset="UTF-8">\n                    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n                    <title>${config.title}</title>\n                    <link rel="stylesheet" href="./style.css">\n                </head>\n                <body>\n                    <h1>Blog Posts</h1>\n                    <ul>\n                        ${postsListHtml}\n                    </ul>\n                    ${paginationNav}\n                </body>\n                </html>\n            `;
        }

        const fileName = page === 1 ? 'index.html' : `index-${page}.html`;
        fs.writeFileSync(path.join(distDir, fileName), indexHtml);
    }

    // RSS Feed Generation
    const rssItems = postData.map(post => {
        const description = post.content.split(' ').slice(0, 100).join(' ') + '...'; // First 100 words
        const pubDate = new Date(post.metadata.date).toUTCString();
        return `\n            <item>\n                <title>${post.title}</title>\n                <link>./${post.htmlFileName}</link>\n                <pubDate>${pubDate}</pubDate>\n                <description>${description}</description>\n            </item>\n        `;
    }).join('');

    const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n    <title>${config.title}</title>\n    <link>./index.html</link>\n    <description>A blog built with Gemini CLI</description>\n    ${rssItems}\n</channel>\n</rss>`;

    fs.writeFileSync(path.join(distDir, 'rss.xml'), rssFeed);

    // Tag Pages Generation
    if (config.includeTags) {
        const tagsDir = path.join(distDir, 'tags');
        if (!fs.existsSync(tagsDir)) {
            fs.mkdirSync(tagsDir);
        }

        const allTags = {};
        postData.forEach(post => {
            if (post.metadata.tags && Array.isArray(post.metadata.tags)) {
                post.metadata.tags.forEach(tag => {
                    if (!allTags[tag]) {
                        allTags[tag] = [];
                    }
                    allTags[tag].push(post);
                });
            }
        });

        for (const tag in allTags) {
            const tagPosts = allTags[tag];
            const tagTotalPages = Math.ceil(tagPosts.length / config.postsPerPage);
            for (let page = 1; page <= tagTotalPages; page++) {
                const startIndex = (page - 1) * config.postsPerPage;
                const endIndex = startIndex + config.postsPerPage;
                const paginatedTagPosts = tagPosts.slice(startIndex, endIndex);

                const tagPostsListHtml = paginatedTagPosts.map(post => `<li><a href="../${post.htmlFileName}">${post.title}</a></li>`).join('');

                let tagPaginationNav = '';
                if (tagTotalPages > 1) {
                    tagPaginationNav += '<div class="pagination">';
                    if (page > 1) {
                        tagPaginationNav += `<a href="${page === 2 ? `${tag}.html` : `${tag}-${page - 1}.html`}">Previous Page</a>`;
                    }
                    tagPaginationNav += `<span> Page ${page} of ${tagTotalPages} </span>`;
                    if (page < tagTotalPages) {
                        tagPaginationNav += `<a href="${tag}-${page + 1}.html">Next Page</a>`;
                    }
                    tagPaginationNav += '</div>';
                }

                const tagFileName = page === 1 ? `${tag}.html` : `${tag}-${page}.html`;
                const tagHtml = `\n                    <!DOCTYPE html>\n                    <html lang="en">\n                    <head>\n                        <meta charset="UTF-8">\n                        <meta name="viewport" content="width=device-width, initial-scale=1.0">\n                        <title>Posts tagged: ${tag}</title>\n                        <link rel="stylesheet" href="../style.css">\n                    </head>\n                    <body>\n                        <h1>Posts Tagged: ${tag}</h1>\n                        <ul>\n                            ${tagPostsListHtml}\n                        </ul>\n                        ${tagPaginationNav}\n                        <p><a href="../index.html">Back to Home</a></p>\n                    </body>\n                    </html>\n                `;
                fs.writeFileSync(path.join(tagsDir, tagFileName), tagHtml);
            }
        }
    }

    // Search Index Generation
    const searchIndex = postData.map(post => ({
        title: post.title,
        url: `./${post.htmlFileName}`,
        excerpt: post.content.split(' ').slice(0, 50).join(' ') + '...',
        tags: post.metadata.tags || [],
        date: post.metadata.date
    }));
    fs.writeFileSync(path.join(distDir, 'search-index.json'), JSON.stringify(searchIndex, null, 2));

    // Save build cache
    fs.writeFileSync(cacheFilePath, JSON.stringify(buildCache, null, 2));

    lastBuildTime = Date.now(); // Update build time after successful build

    let successMessage = 'Blog built successfully!';
    if (githubPages) {
        successMessage += `\nFor GitHub Pages deployment, consider running: git subtree push --prefix ${distDir} origin gh-pages`;
    }
    console.log(successMessage);
}

async function initWizard() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    function askQuestion(query) {
        return new Promise(resolve => rl.question(query, resolve));
    }

    console.log("\nWelcome to the Gemini Blog Build Setup Wizard!");
    console.log("Let's get your blog configured.\n");

    const blogTitle = await askQuestion(`Blog Title (${config.title}): `) || config.title;
    const outputDir = await askQuestion(`Output Directory (${config.outputDir}): `) || config.outputDir;
    const templateFile = await askQuestion(`Post Template File (${config.template}): `) || config.template;
    const homepageTemplateFile = await askQuestion(`Homepage Template File (${config.homepageTemplate}): `) || config.homepageTemplate;
    const postsPerPage = parseInt(await askQuestion(`Posts Per Page (${config.postsPerPage}): `) || config.postsPerPage, 10);
    const permalink = await askQuestion(`Permalink Structure (${config.permalink}): `) || config.permalink;
    const theme = await askQuestion(`Theme (${config.theme}): `) || config.theme;

    const newConfig = {
        title: blogTitle,
        outputDir: outputDir,
        template: templateFile,
        homepageTemplate: homepageTemplateFile,
        postsPerPage: postsPerPage,
        permalink: permalink,
        theme: theme
    };

    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    console.log(`\nConfig file created at ${configPath}`);

    if (!fs.existsSync(postsDir)) {
        fs.mkdirSync(postsDir);
        console.log(`Created posts directory at ${postsDir}`);
    }

    // Create default theme structure if it doesn't exist
    const defaultThemeDir = path.join(process.cwd(), 'themes', 'default');
    if (!fs.existsSync(defaultThemeDir)) {
        fs.mkdirSync(defaultThemeDir, { recursive: true });
        console.log(`Created default theme directory at ${defaultThemeDir}`);

        // Default post template for default theme
        const defaultThemeTemplateContent = `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>{{title}}</title>\n    <link rel="stylesheet" href="../style.css">\n</head>\n<body>\n    <h1>{{title}}</h1>\n    {{content}}\n    <div class="nav">\n        {{prev}}\n        {{next}}\n    </div>\n</body>\n</html>\n`;
        fs.writeFileSync(path.join(defaultThemeDir, 'template.html'), defaultThemeTemplateContent);
        console.log(`Created default theme post template at ${path.join(defaultThemeDir, 'template.html')}`);

        // Default homepage template for default theme
        const defaultThemeHomepageTemplateContent = `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>{{blogTitle}}</title>\n    <link rel="stylesheet" href="./style.css">\n</head>\n<body>\n    <h1>{{blogTitle}}</h1>\n    <ul>\n        {{postsList}}\n    </ul>\n    {{pagination}}\n</body>\n</html>\n`;
        fs.writeFileSync(path.join(defaultThemeDir, 'homepage-template.html'), defaultThemeHomepageTemplateContent);
        console.log(`Created default theme homepage template at ${path.join(defaultThemeDir, 'homepage-template.html')}`);

        // Default style.css for default theme
        const defaultThemeCssContent = `\n            body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }\n            h1, h2, h3 { color: #333; }\n            a { color: #007bff; text-decoration: none; }\n            a:hover { text-decoration: underline; }\n            ul { list-style: none; padding: 0; }\n            li { margin-bottom: 1rem; }\n            .nav { display: flex; justify-content: space-between; margin-top: 2rem; }\n            .pagination { margin-top: 2rem; display: flex; justify-content: space-between; }\n            .admonition { padding: 1em; margin: 1em 0; border-left: 4px solid; border-radius: 4px; }\n            .admonition-title { font-weight: bold; margin-top: 0; }\n            .admonition.note { border-color: #2196F3; background-color: #e3f2fd; }\n            .admonition.note .admonition-title { color: #2196F3; }\n            .admonition.tip { border-color: #4CAF50; background-color: #e8f5e9; }\n            .admonition.tip .admonition-title { color: #4CAF50; }\n            .admonition.warning { border-color: #FFC107; background-color: #fff8e1; }\n            .admonition.warning .admonition-title { color: #FFC107; }\n            .admonition.danger { border-color: #F44336; background-color: #ffebee; }\n            .admonition.danger .admonition-title { color: #F44336; }\n            .footnotes { margin-top: 2em; padding-top: 1em; border-top: 1px solid #eee; font-size: 0.9em; }\n            .footnotes ol { padding-left: 1.5em; }\n            .footnotes li { margin-bottom: 0.5em; }\n            .footnotes li a { text-decoration: none; }\n            .footnotes li a:hover { text-decoration: underline; }\n            table { border-collapse: collapse; width: 100%; margin: 1em 0; }\n            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }\n            th { background-color: #f2f2f2; }\n            figure { margin: 1em 0; text-align: center; }\n            figure img { max-width: 100%; height: auto; display: block; margin: 0 auto; }\n            figcaption { font-size: 0.9em; color: #555; margin-top: 0.5em; }\n            .shortcode-quote { border-left: 4px solid #ccc; padding-left: 1em; margin: 1em 0; font-style: italic; }\n            .shortcode-quote cite { display: block; text-align: right; font-style: normal; color: #777; }\n            pre { background-color: #eee; padding: 1em; overflow-x: auto; }\n            .keyword { color: #00f; }\n            .string { color: #a31515; }\n            .comment { color: #008000; }\n            .number { color: #f90; }\n        `;
        fs.writeFileSync(path.join(defaultThemeDir, 'style.css'), defaultThemeCssContent);
        console.log(`Created default theme style at ${path.join(defaultThemeDir, 'style.css')}`);
    }

    rl.close();
    console.log("\nSetup complete! You can now add Markdown files to your posts directory and run the tool.");
}

async function newPostWizard() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    function askQuestion(query) {
        return new Promise(resolve => rl.question(query, resolve));
    }

    console.log("\nCreating a new blog post!");

    const title = await askQuestion("Post Title: ");
    const author = await askQuestion("Author (optional): ");

    // Get existing tags for suggestions
    const existingTags = new Set();
    const allMarkdownFiles = fs.readdirSync(postsDir).filter(file => file.endsWith('.md'));
    allMarkdownFiles.forEach(file => {
        const filePath = path.join(postsDir, file);
        const fullContent = fs.readFileSync(filePath, 'utf-8');
        const { metadata } = parseFrontmatter(fullContent);
        if (metadata.tags && Array.isArray(metadata.tags)) {
            metadata.tags.forEach(tag => existingTags.add(tag));
        }
    });
    const tagsSuggestion = existingTags.size > 0 ? ` (e.g., ${Array.from(existingTags).join(', ')})` : '';

    const tagsInput = await askQuestion(`Tags (comma-separated, optional)${tagsSuggestion}: `);
    const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()) : [];
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const isDraft = (await askQuestion("Mark as draft? (yes/no): ")).toLowerCase() === 'yes';

    const fileName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-*|-*$/g, '') + '.md';
    const filePath = path.join(postsDir, fileName);

    const frontmatter = [
        "---",
        `title: "${title}" `,
        `date: ${date}`
    ];
    if (author) frontmatter.push(`author: ${author}`);
    if (tags.length > 0) frontmatter.push(`tags: [${tags.join(', ')}]`);
    if (isDraft) frontmatter.push(`draft: true`);
    frontmatter.push("---");

    const content = frontmatter.join('\n') + '\n\nWrite your post content here.';

    fs.writeFileSync(filePath, content);
    console.log(`\nNew post created at: ${filePath}`);

    const openInEditor = (await askQuestion("Open in default editor? (yes/no): ")).toLowerCase() === 'yes';
    if (openInEditor) {
        exec(`open ${filePath}`, (err) => {
            if (err) {
                console.error(`Could not open file: ${err}`);
            }
        });
    }

    rl.close();
}

// Function to display help information
function showHelp() {
    console.log(`\nUsage: blog-build [command] [options]\n\nCommands:\n  init              Run the interactive setup wizard.\n  new               Create a new blog post interactively.\n  config            Display current configuration.\n\nOptions:\n  --output <dir>    Specify the output directory (overrides blog.config.json).\n  --watch           Enable watch mode (rebuilds on file changes).\n  --serve           Start a local development server with live reload.\n  --clean           Clean the output directory before building.\n  ----github-pages  Prepare output for GitHub Pages deployment.\n  --help, -h        Display this help message.\n\nExamples:\n  blog-build init\n  blog-build new\n  blog-build\n  blog-build --watch\n  blog-build --serve\n  blog-build --clean\n  blog-build --output public\n  blog-build --github-pages\n    `);
}

// Function to display current config
function showConfig() {
    console.log("\nCurrent Configuration:");
    console.log(JSON.stringify(config, null, 2));
}

if (initMode) {
    initWizard();
} else if (newPostMode) {
    newPostWizard();
} else if (helpMode) {
    showHelp();
} else if (configMode) {
    showConfig();
} else if (serveMode) {
    const server = http.createServer((req, res) => {
        if (req.url === '/__last_build_time__') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ lastBuildTime }));
            return;
        }

        let filePath = path.join(distDir, req.url);
        if (filePath.endsWith('/')) {
            filePath += 'index.html';
        }

        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404);
                    res.end('404 Not Found');
                } else {
                    res.writeHead(500);
                    res.end(`Server Error: ${err.code}`);
                }
            } else {
                let servedContent = content.toString();
                // Inject live reload script only for HTML files
                if (filePath.endsWith('.html')) {
                    servedContent = servedContent.replace('</body>', `\n                        <script>\n                            let lastBuildTime = ${lastBuildTime};\n                            setInterval(() => {\n                                fetch('/__last_build_time__')\n                                    .then(response => response.json())\n                                    .then(data => {\n                                        if (data.lastBuildTime > lastBuildTime) {\n                                            window.location.reload();\n                                        }\n                                    });\n                            }, 1000);\n                        </script>\n                    </body>`);
                }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(servedContent, 'utf-8');
            }
        });
    });

    const port = 3000;
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
        console.log(`Serving files from ${distDir}`);
    });

} else if (watchMode) {
    console.log(`Watching for changes in ${postsDir}...`);
    fs.watch(postsDir, (eventType, filename) => {
        console.log(`Detected ${eventType} in ${filename}. Rebuilding...`);
        buildBlog();
    });
} else {
    buildBlog();
}