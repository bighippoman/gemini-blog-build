#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const http = require('http');

const defaultConfig = {
    title: "My AI-Built Blog",
    outputDir: "dist",
    template: "template.html",
    homepageTemplate: "homepage-template.html",
    includeTags: true, // Default to true for tag pages
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

// Parse CLI arguments
const args = process.argv.slice(2);
let postsDir = 'posts';
let watchMode = false;
let githubPages = false;
let initMode = false;
let cleanBuild = false;
let serveMode = false;
let newPostMode = false;

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
    } else if (!arg.startsWith('--')) {
        postsDir = arg; // Assume the first non-flag argument is the posts directory
    }
}

const distDir = config.outputDir;
const templatePath = config.template;
const homepageTemplatePath = config.homepageTemplate;
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

    // First pass for footnotes definitions
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const footnoteMatch = line.match(/^\s*\[\^(\d+)\]:\s*(.*)/);
        if (footnoteMatch) {
            footnotes[footnoteMatch[1]] = footnoteMatch[2].trim();
            lines[i] = ''; // Remove footnote definition from content
        }
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let trimmedLine = line.trim();

        // Code block detection
        if (line.startsWith('```')) {
            if (inCodeBlock) {
                html.push(`<pre><code class="language-${codeLang}">${codeContent.join('\n')}</code></pre>`);
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

        // Admonition detection
        const admonitionMatch = trimmedLine.match(/^>\s*\[!(NOTE|TIP|WARNING|DANGER)\]\s*(.*)/);
        if (admonitionMatch) {
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
            if (!inBlockquote) {
                html.push('<blockquote>');
                inBlockquote = true;
            }
            html.push(`<p>${trimmedLine.substring(1).trim()}</p>`);
            continue;
        } else if (inBlockquote) {
            html.push('</blockquote>');
            inBlockquote = false;
        }

        // List detection (unordered)
        if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
            if (!inUnorderedList) {
                html.push('<ul>');
                inUnorderedList = true;
            }
            html.push(`<li>${trimmedLine.substring(1).trim()}</li>`);
            continue;
        } else if (inUnorderedList) {
            html.push('</ul>');
            inUnorderedList = false;
        }

        // List detection (ordered)
        if (trimmedLine.match(/^\d+\./)) {
            if (!inOrderedList) {
                html.push('<ol>');
                inOrderedList = true;
            }
            html.push(`<li>${trimmedLine.substring(trimmedLine.indexOf('.') + 1).trim()}</li>`);
            continue;
        } else if (inOrderedList) {
            html.push('</ol>');
            inOrderedList = false;
        }

        // Definition List detection
        const defListMatch = trimmedLine.match(/^(.*?)\s*:\s*(.*)$/);
        if (defListMatch) {
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
            html.push(`<h6>${line.substring(6).trim()}</h6>`);
        } else if (line.startsWith('#####')) {
            html.push(`<h5>${line.substring(5).trim()}</h5>`);
        } else if (line.startsWith('####')) {
            html.push(`<h4>${line.substring(4).trim()}</h4>`);
        } else if (line.startsWith('###')) {
            html.push(`<h3>${line.substring(3).trim()}</h3>`);
        } else if (line.startsWith('##')) {
            html.push(`<h2>${line.substring(2).trim()}</h2>`);
        } else if (line.startsWith('#')) {
            html.push(`<h1>${line.substring(1).trim()}</h1>`);
        } else if (line.trim() === '') {
            html.push('<br>');
        } else {
            // Footnote references
            line = line.replace(/\[\^(\d+)\]/g, (match, fnId) => {
                if (footnotes[fnId]) {
                    return `<sup><a href="#fn${fnId}" id="fnref${fnId}">${fnId}</a></sup>`;
                } else {
                    return match; // Keep original if footnote not defined
                }
            });

            // Images with optional captions
            line = line.replace(/!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)/g, (match, alt, src, caption) => {
                let imgTag = `<img alt="${alt}" src="${src}">`;
                if (caption) {
                    return `<figure>${imgTag}<figcaption>${caption}</figcaption></figure>`;
                } else {
                    return imgTag;
                }
            });

            // Bold and Italic
            line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold
            line = line.replace(/\*(.*?)\*/g, '<em>$1</em>');     // Italic

            // Auto-link URLs
            line = line.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>');

            html.push(`<p>${line}</p>`);
        }
    }

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

    // Generate CSS file based on design tokens
    let cssContent = `
        body { font-family: ${config.designTokens.fontFamily}; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
        h1 { font-size: ${config.designTokens.h1Size}; color: ${config.designTokens.primaryColor}; }
        h2 { font-size: ${config.designTokens.h2Size}; }
        h3 { font-size: ${config.designTokens.h3Size}; }
        h4 { font-size: ${config.designTokens.h4Size}; }
        h5 { font-size: ${config.designTokens.h5Size}; }
        h6 { font-size: ${config.designTokens.h6Size}; }
        a { color: ${config.designTokens.primaryColor}; text-decoration: none; }
        a:hover { text-decoration: underline; }
        ul { list-style: none; padding: 0; }
        li { margin-bottom: 1rem; }
        .nav { display: flex; justify-content: space-between; margin-top: 2rem; }
        /* Admonition styles */
        .admonition { padding: 1em; margin: 1em 0; border-left: 4px solid; border-radius: 4px; }
        .admonition-title { font-weight: bold; margin-top: 0; }
        .admonition.note { border-color: #2196F3; background-color: #e3f2fd; }
        .admonition.note .admonition-title { color: #2196F3; }
        .admonition.tip { border-color: #4CAF50; background-color: #e8f5e9; }
        .admonition.tip .admonition-title { color: #4CAF50; }
        .admonition.warning { border-color: #FFC107; background-color: #fff8e1; }
        .admonition.warning .admonition-title { color: #FFC107; }
        .admonition.danger { border-color: #F44336; background-color: #ffebee; }
        .admonition.danger .admonition-title { color: #F44336; }
        /* Footnotes */
        .footnotes { margin-top: 2em; padding-top: 1em; border-top: 1px solid #eee; font-size: 0.9em; }
        .footnotes ol { padding-left: 1.5em; }
        .footnotes li { margin-bottom: 0.5em; }
        .footnotes li a { text-decoration: none; }
        .footnotes li a:hover { text-decoration: underline; }
        /* Tables */
        table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        /* Images with captions */
        figure { margin: 1em 0; text-align: center; }
        figure img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
        figcaption { font-size: 0.9em; color: #555; margin-top: 0.5em; }
        /* Shortcodes */
        .shortcode-quote { border-left: 4px solid #ccc; padding-left: 1em; margin: 1em 0; font-style: italic; }
        .shortcode-quote cite { display: block; text-align: right; font-style: normal; color: #777; }
    `;
    fs.writeFileSync(path.join(distDir, 'style.css'), cssContent);

    // Copy assets before processing posts
    if (fs.existsSync(assetsDir)) {
        copyRecursiveSync(assetsDir, distDir);
    }

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
        const htmlFileName = post.replace('.md', '.html');

        return {
            htmlFileName,
            title,
            content: markdownContent,
            metadata
        };
    }).filter(post => !post.metadata.draft) // Filter out draft posts
    .sort((a, b) => new Date(b.metadata.date) - new Date(a.metadata.date)); // Sort by date, newest first

    let postTemplate = null;
    if (fs.existsSync(templatePath)) {
        postTemplate = fs.readFileSync(templatePath, 'utf-8');
    }

    postData.forEach((post, index) => {
        // Only re-write HTML for changed/new files
        if (filesToProcess.includes(post.htmlFileName.replace('.html', '.md'))) {
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
                finalHtml = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>${post.title}</title>
                        <link rel="stylesheet" href="./style.css">
                    </head>
                    <body>
                        <h1>${post.title}</h1>
                        ${htmlContent}
                        <div class="nav">
                            ${prevLink}
                            ${nextLink}
                        </div>
                    </body>
                    </html>
                `;
            }
            fs.writeFileSync(path.join(distDir, post.htmlFileName), finalHtml);
        }

        // Update cache for processed file (even if not re-written, its metadata might be needed for global files)
        const stats = fs.statSync(path.join(postsDir, post.htmlFileName.replace('.html', '.md')));
        buildCache[post.htmlFileName.replace('.html', '.md')] = stats.mtimeMs;
    });

    let homepageTemplate = null;
    if (fs.existsSync(homepageTemplatePath)) {
        homepageTemplate = fs.readFileSync(homepageTemplatePath, 'utf-8');
    }

    const postsListHtml = postData.map(post => `<li><a href="${post.htmlFileName}">${post.title}</a></li>`).join('');

    let indexHtml;
    if (homepageTemplate) {
        indexHtml = homepageTemplate
            .replace(/{{blogTitle}}/g, config.title)
            .replace(/{{postsList}}/g, postsListHtml);
        indexHtml = processIncludes(indexHtml); // Process includes in homepage template
    } else {
        indexHtml = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${config.title}</title>
                <link rel="stylesheet" href="./style.css">
            </head>
            <body>
                <h1>Blog Posts</h1>
                <ul>
                    ${postsListHtml}
                </ul>
            </body>
            </html>
        `;
    }

    fs.writeFileSync(path.join(distDir, 'index.html'), indexHtml);

    // RSS Feed Generation
    const rssItems = postData.map(post => {
        const description = post.content.split(' ').slice(0, 100).join(' ') + '...'; // First 100 words
        const pubDate = new Date(post.metadata.date).toUTCString();
        return `
            <item>
                <title>${post.title}</title>
                <link>./${post.htmlFileName}</link>
                <pubDate>${pubDate}</pubDate>
                <description>${description}</description>
            </item>
        `;
    }).join('');

    const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
    <title>${config.title}</title>
    <link>./index.html</link>
    <description>A blog built with Gemini CLI</description>
    ${rssItems}
</channel>
</rss>`;

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
            const tagHtml = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Posts tagged: ${tag}</title>
                    <link rel="stylesheet" href="../style.css">
                </head>
                <body>
                    <h1>Posts Tagged: ${tag}</h1>
                    <ul>
                        ${tagPosts.map(post => `<li><a href="../${post.htmlFileName}">${post.title}</a></li>`).join('')}
                    </ul>
                    <p><a href="../index.html">Back to Home</a></p>
                </body>
                </html>
            `;
            fs.writeFileSync(path.join(tagsDir, `${tag}.html`), tagHtml);
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

    const blogTitle = await askQuestion(`Blog Title (${defaultConfig.title}): `) || defaultConfig.title;
    const outputDir = await askQuestion(`Output Directory (${defaultConfig.outputDir}): `) || defaultConfig.outputDir;
    const templateFile = await askQuestion(`Post Template File (${defaultConfig.template}): `) || defaultConfig.template;
    const homepageTemplateFile = await askQuestion(`Homepage Template File (${defaultConfig.homepageTemplate}): `) || defaultConfig.homepageTemplate;

    const newConfig = {
        title: blogTitle,
        outputDir: outputDir,
        template: templateFile,
        homepageTemplate: homepageTemplateFile
    };

    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    console.log(`\nConfig file created at ${configPath}`);

    if (!fs.existsSync(postsDir)) {
        fs.mkdirSync(postsDir);
        console.log(`Created posts directory at ${postsDir}`);
    }

    if (!fs.existsSync(templateFile)) {
        const defaultTemplateContent = `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>{{title}}</title>\n    <link rel="stylesheet" href="./style.css">\n</head>\n<body>\n    <h1>{{title}}</h1>\n    {{content}}\n    <div class="nav">\n        {{prev}}\n        {{next}}\n    </div>\n</body>\n</html>\n`;
        fs.writeFileSync(templateFile, defaultTemplateContent);
        console.log(`Created default post template file at ${templateFile}`);
    }

    if (!fs.existsSync(homepageTemplateFile)) {
        const defaultHomepageTemplateContent = `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>{{blogTitle}}</title>\n    <link rel="stylesheet" href="./style.css">\n</head>\n<body>\n    <h1>{{blogTitle}}</h1>\n    <ul>\n        {{postsList}}\n    </ul>\n</body>\n</html>\n`;
        fs.writeFileSync(homepageTemplateFile, defaultHomepageTemplateContent);
        console.log(`Created default homepage template file at ${homepageTemplateFile}`);
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
    const tagsInput = await askQuestion("Tags (comma-separated, optional): ");
    const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()) : [];
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const fileName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-*|-*$/g, '') + '.md';
    const filePath = path.join(postsDir, fileName);

    const frontmatter = [
        "---",
        `title: "${title}" `,
        `date: ${date}`
    ];
    if (author) frontmatter.push(`author: ${author}`);
    if (tags.length > 0) frontmatter.push(`tags: [${tags.join(', ')}]`);
    frontmatter.push("---");

    const content = frontmatter.join('\n') + '\n\nWrite your post content here.';

    fs.writeFileSync(filePath, content);
    console.log(`\nNew post created at: ${filePath}`);

    rl.close();
}

if (initMode) {
    initWizard();
} else if (newPostMode) {
    newPostWizard();
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
                    servedContent = servedContent.replace('</body>', `
                        <script>
                            let lastBuildTime = ${lastBuildTime};
                            setInterval(() => {
                                fetch('/__last_build_time__')
                                    .then(response => response.json())
                                    .then(data => {
                                        if (data.lastBuildTime > lastBuildTime) {
                                            window.location.reload();
                                        }
                                    });
                            }, 1000);
                        </script>
                    </body>`);
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