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
    includeTags: true // Default to true for tag pages
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
    } else if (!arg.startsWith('--')) {
        postsDir = arg; // Assume the first non-flag argument is the posts directory
    }
}

const distDir = config.outputDir;
const templatePath = config.template;
const homepageTemplatePath = config.homepageTemplate;
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

        // List detection
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
            // Images
            line = line.replace(/!\[(.*?)\]\((.*?)\)/g, '<img alt="$1" src="$2">');

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

    if (filesToProcess.length === 0 && Object.keys(buildCache).length === currentMarkdownFiles.length) {
        console.log("No changes detected. Skipping build.");
        return; // Skip build if no changes
    }

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
                finalHtml = processIncludes(finalHtml); // Process includes in post template
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
        const defaultTemplateContent = `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>{{title}}</title>\n    <style>\n        body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }\n        h1, h2, h3 { color: #333; }\n        a { color: #007bff; text-decoration: none; }\n        a:hover { text-decoration: underline; }\n        .nav { display: flex; justify-content: space-between; margin-top: 2rem; }\n    </style>\n</head>\n<body>\n    <h1>{{title}}</h1>\n    {{content}}\n    <div class="nav">\n        {{prev}}\n        {{next}}\n    </div>\n</body>\n</html>\n`;
        fs.writeFileSync(templateFile, defaultTemplateContent);
        console.log(`Created default post template file at ${templateFile}`);
    }

    if (!fs.existsSync(homepageTemplateFile)) {
        const defaultHomepageTemplateContent = `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>{{blogTitle}}</title>\n    <style>\n        body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }\n        h1 { color: #333; }\n        ul { list-style: none; padding: 0; }\n        li { margin-bottom: 1rem; }\n        a { color: #007bff; text-decoration: none; }\n        a:hover { text-decoration: underline; }\n    </style>\n</head>\n<body>\n    <h1>{{blogTitle}}</h1>\n    <ul>\n        {{postsList}}\n    </ul>\n</body>\n</html>\n`;
        fs.writeFileSync(homepageTemplateFile, defaultHomepageTemplateContent);
        console.log(`Created default homepage template file at ${homepageTemplateFile}`);
    }

    rl.close();
    console.log("\nSetup complete! You can now add Markdown files to your posts directory and run the tool.");
}

if (initMode) {
    initWizard();
} else if (serveMode) {
    const server = http.createServer((req, res) => {
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
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content, 'utf-8');
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