/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

// Ensure dist directory exists
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy static files
const staticFiles = [
  'manifest.json',
  'popup.html',
  'welcome.html'
];

staticFiles.forEach(file => {
  const srcPath = path.join(__dirname, 'src', file);
  const destPath = path.join(distDir, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file}`);
  }
});

// Create icons directory and placeholder icons
const iconsDir = path.join(distDir, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Create simple placeholder icon (SVG as PNG would require more complex setup)
const iconSizes = [16, 32, 48, 128];
iconSizes.forEach(size => {
  const iconPath = path.join(iconsDir, `icon${size}.png`);
  if (!fs.existsSync(iconPath)) {
    // Create a simple placeholder file for now
    fs.writeFileSync(iconPath, '');
    console.log(`Created placeholder icon${size}.png`);
  }
});

const commonConfig = {
  bundle: true,
  minify: isProduction,
  sourcemap: !isProduction,
  target: ['chrome88', 'firefox88'],
  logLevel: 'info',
};

const builds = [
  {
    ...commonConfig,
    entryPoints: ['src/background.ts'],
    outfile: 'dist/background.js',
    format: 'iife',
    platform: 'browser',
  },
  {
    ...commonConfig,
    entryPoints: ['src/content.ts'],
    outfile: 'dist/content.js',
    format: 'iife',
    platform: 'browser',
  },
  {
    ...commonConfig,
    entryPoints: ['src/popup.ts'],
    outfile: 'dist/popup.js',
    format: 'iife',
    platform: 'browser',
  },
];

async function build() {
  try {
    if (isWatch) {
      console.log('Building in watch mode...');
      const contexts = await Promise.all(
        builds.map(config => esbuild.context(config))
      );
      await Promise.all(contexts.map(ctx => ctx.watch()));
      console.log('Watching for changes...');
    } else {
      console.log('Building...');
      await Promise.all(builds.map(config => esbuild.build(config)));
      console.log('Build complete!');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();