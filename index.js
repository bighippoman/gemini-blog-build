#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const defaultConfig = {
    title: "My AI-Built Blog",
    outputDir: "dist",
    template: "template.html",
    includeTags: false // Placeholder for future use
};

let config = defaultConfig;
const configPath = 'blog.config.json';

// Parse CLI arguments
const args = process.argv.slice(2);
let postsDir = 'posts';
let watchMode = false;
let githubPages = false;
let initMode = false;

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
    } else if (!arg.startsWith('--')) {
        postsDir = arg; // Assume the first non-flag argument is the posts directory
    }
}

const distDir = config.outputDir;
const templatePath = config.template;
const assetsDir = 'assets';

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

// Enhanced Markdown to HTML conversion
function mdToHtml(md) {
    let html = [];
    const lines = md.split('\n');
    let inCodeBlock = false;
    let codeLang = '';
    let codeContent = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

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
            // Bold and Italic
            line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold
            line = line.replace(/\*(.*?)\*/g, '<em>$1</em>');     // Italic

            // Auto-link URLs
            line = line.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>');

            html.push(`<p>${line}</p>`);
        }
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
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir);
    }

    // Copy assets before processing posts
    if (fs.existsSync(assetsDir)) {
        copyRecursiveSync(assetsDir, distDir);
    }

    // Create .nojekyll file for GitHub Pages
    if (githubPages) {
        fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
    }

    const posts = fs.readdirSync(postsDir).filter(file => file.endsWith('.md'));

    const postData = posts.map(post => {
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
    }).sort((a, b) => new Date(b.metadata.date) - new Date(a.metadata.date)); // Sort by date, newest first

    let postTemplate = null;
    if (fs.existsSync(templatePath)) {
        postTemplate = fs.readFileSync(templatePath, 'utf-8');
    }

    postData.forEach((post, index) => {
        const prevPost = index > 0 ? postData[index - 1] : null;
        const nextPost = index < postData.length - 1 ? postData[index + 1] : null;

        let htmlContent = mdToHtml(post.content);
        let prevLink = prevPost ? `<a href="${prevPost.htmlFileName}">&laquo; ${prevPost.title}</a>` : '<span></span>';
        let nextLink = nextPost ? `<a href="${nextPost.htmlFileName}">${nextPost.title} &raquo;</a>` : '<span></span>';

        let finalHtml;
        if (postTemplate) {
            finalHtml = postTemplate
                .replace(/{{title}}/g, post.title)
                .replace(/{{content}}/g, htmlContent)
                .replace(/{{prev}}/g, prevLink)
                .replace(/{{next}}/g, nextLink);
        } else {
            finalHtml = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>${post.title}</title>
                    <style>
                        body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
                        h1, h2, h3 { color: #333; }
                        a { color: #007bff; text-decoration: none; }
                        a:hover { text-decoration: underline; }
                        .nav { display: flex; justify-content: space-between; margin-top: 2rem; }
                    </style>
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
    });

    const indexHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${config.title}</title>
            <style>
                body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
                h1 { color: #333; }
                ul { list-style: none; padding: 0; }
                li { margin-bottom: 1rem; }
                a { color: #007bff; text-decoration: none; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <h1>Blog Posts</h1>
            <ul>
                ${postData.map(post => `<li><a href="${post.htmlFileName}">${post.title}</a></li>`).join('')}
            </ul>
        </body>
        </html>
    `;

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
    const templateFile = await askQuestion(`Template File (${defaultConfig.template}): `) || defaultConfig.template;

    const newConfig = {
        title: blogTitle,
        outputDir: outputDir,
        template: templateFile
    };

    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    console.log(`\nConfig file created at ${configPath}`);

    if (!fs.existsSync(postsDir)) {
        fs.mkdirSync(postsDir);
        console.log(`Created posts directory at ${postsDir}`);
    }

    if (!fs.existsSync(templateFile)) {
        const defaultTemplateContent = `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>{{title}}</title>\n    <style>\n        body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }\n        h1, h2, h3 { color: #333; }\n        a { color: #007bff; text-decoration: none; }\n        a:hover { text-decoration: underline; }\n        .nav { display: flex; justify-content: space-between; margin-top: 2rem; }\n    </style>\n</head>\n<body>\n    <h1>{{title}}</h1>\n    {{content}}\n    <div class="nav">\n        {{prev}}\n        {{next}}\n    </div>\n</body>\n</html>\n`;
        fs.writeFileSync(templateFile, defaultTemplateContent);
        console.log(`Created default template file at ${templateFile}`);
    }

    rl.close();
    console.log("\nSetup complete! You can now add Markdown files to your posts directory and run the tool.");
}

if (initMode) {
    initWizard();
} else if (watchMode) {
    console.log(`Watching for changes in ${postsDir}...`);
    fs.watch(postsDir, (eventType, filename) => {
        console.log(`Detected ${eventType} in ${filename}. Rebuilding...`);
        buildBlog();
    });
} else {
    buildBlog();
}
