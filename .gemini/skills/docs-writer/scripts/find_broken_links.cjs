#!/usr/bin/env node
/**
 * Simple script to find broken internal Markdown links in a directory.
 * Usage: node find_broken_links.cjs <directory>
 */

const fs = require('fs');
const path = require('path');

const targetDir = process.argv[2];
if (!targetDir) {
  console.error('Error: Please provide a directory path.');
  process.exit(1);
}

function findFiles(dir, ext, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findFiles(filePath, ext, fileList);
    } else if (filePath.endsWith(ext)) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const mdFiles = findFiles(targetDir, '.md');
const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
let brokenLinksFound = 0;

mdFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const linkPath = match[2];

    // Only check relative, internal links (not http, mailto, etc.)
    if (linkPath.startsWith('http') || linkPath.startsWith('mailto:') || linkPath.startsWith('#')) {
      continue;
    }

    // Strip anchor from link path
    const cleanLinkPath = linkPath.split('#')[0];
    if (!cleanLinkPath) continue;

    const absoluteLinkPath = path.resolve(dir, cleanLinkPath);

    if (!fs.existsSync(absoluteLinkPath)) {
      console.log(`Broken link in ${path.relative(targetDir, file)}: [${match[1]}](${linkPath}) -> Not found at: ${path.relative(targetDir, absoluteLinkPath)}`);
      brokenLinksFound++;
    }
  }
});

if (brokenLinksFound === 0) {
  console.log('Success: No broken internal links found.');
} else {
  console.log(`\nFinished: Found ${brokenLinksFound} broken link(s).`);
}
