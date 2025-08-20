/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packageName = 'gemini-cli-browser-extension';
const version = require('../package.json').version;

// Clean and create packaging directory
const packagingDir = path.join(__dirname, '..', 'packaging');
if (fs.existsSync(packagingDir)) {
  fs.rmSync(packagingDir, { recursive: true });
}
fs.mkdirSync(packagingDir, { recursive: true });

// Copy dist files to packaging directory
const distDir = path.join(__dirname, '..', 'dist');
const chromeDir = path.join(packagingDir, 'chrome');
const firefoxDir = path.join(packagingDir, 'firefox');

// Create browser-specific directories
fs.mkdirSync(chromeDir, { recursive: true });
fs.mkdirSync(firefoxDir, { recursive: true });

// Copy all dist files to both directories
function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const items = fs.readdirSync(src);
    items.forEach(item => {
      copyRecursive(path.join(src, item), path.join(dest, item));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

copyRecursive(distDir, chromeDir);
copyRecursive(distDir, firefoxDir);

// Modify manifest for Firefox (manifest v2)
const firefoxManifest = JSON.parse(fs.readFileSync(path.join(firefoxDir, 'manifest.json'), 'utf8'));
firefoxManifest.manifest_version = 2;
firefoxManifest.background = {
  scripts: ['background.js'],
  persistent: false
};
firefoxManifest.browser_action = firefoxManifest.action;
delete firefoxManifest.action;
delete firefoxManifest.host_permissions;
firefoxManifest.permissions.push('<all_urls>');

fs.writeFileSync(
  path.join(firefoxDir, 'manifest.json'),
  JSON.stringify(firefoxManifest, null, 2)
);

console.log(`Packaged extension for Chrome and Firefox in ${packagingDir}`);
console.log('');
console.log('Installation instructions:');
console.log('');
console.log('Chrome:');
console.log('1. Open chrome://extensions/');
console.log('2. Enable "Developer mode"');
console.log('3. Click "Load unpacked"');
console.log(`4. Select the ${chromeDir} directory`);
console.log('');
console.log('Firefox:');
console.log('1. Open about:debugging');
console.log('2. Click "This Firefox"');
console.log('3. Click "Load Temporary Add-on"');
console.log(`4. Select any file in the ${firefoxDir} directory`);
console.log('');
console.log(`Package version: ${version}`);