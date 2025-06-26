#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const postsDir = process.argv[2] || 'posts';
const distDir = 'dist';

if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

// Simple Markdown to HTML conversion
function mdToHtml(md) {
    return md
        .split('\n')
        .map(line => {
            if (line.startsWith('###')) {
                return `<h3>${line.substring(3).trim()}</h3>`;
            } else if (line.startsWith('##')) {
                return `<h2>${line.substring(2).trim()}</h2>`;
            } else if (line.startsWith('#')) {
                return `<h1>${line.substring(1).trim()}</h1>`;
            } else if (line.trim() === '') {
                return '<br>';
            } else {
                return `<p>${line}</p>`;
            }
        })
        .join('\n');
}

const posts = fs.readdirSync(postsDir).filter(file => file.endsWith('.md'));

const postData = posts.map(post => {
    const filePath = path.join(postsDir, post);
    const content = fs.readFileSync(filePath, 'utf-8');
    const title = content.split('\n')[0].replace(/#/g, '').trim();
    const htmlFileName = post.replace('.md', '.html');
    return {
        htmlFileName,
        title,
        content
    };
});

postData.forEach((post, index) => {
    const prevPost = index > 0 ? postData[index - 1] : null;
    const nextPost = index < postData.length - 1 ? postData[index + 1] : null;

    let html = `
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
            ${mdToHtml(post.content)}
            <div class="nav">
                ${prevPost ? `<a href="${prevPost.htmlFileName}">&laquo; ${prevPost.title}</a>` : '<span></span>'}
                ${nextPost ? `<a href="${nextPost.htmlFileName}">${nextPost.title} &raquo;</a>` : '<span></span>'}
            </div>
        </body>
        </html>
    `;
    fs.writeFileSync(path.join(distDir, post.htmlFileName), html);
});

const indexHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Blog</title>
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

console.log('Blog built successfully!');