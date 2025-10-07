/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Copy Python and dotnet-processor to the build output directory
 * This runs as an afterPack hook in electron-builder
 */

const log = (message) => {
  console.log(`[Copy Python] ${message}`);
};

const error = (message) => {
  console.error(`[Copy Python Error] ${message}`);
};

function copyDirectory(src, dest, excludeDirs = [], isRoot = true) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Only apply excludeDirs at root level
      if (!isRoot || !excludeDirs.includes(entry.name)) {
        copyDirectory(srcPath, destPath, excludeDirs, false);
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function copyPython(context) {
  try {
    const appOutDir = context.appOutDir;
    const resourcesDir = path.join(appOutDir, 'resources', 'app');

    // Copy Python to node_modules/@google/ to match the relative path calculation
    // Core package calculates: core/dist/src/tools → core/dist/src → core/dist → core → @google → python-3.13.7
    // So Python should be at: resources/app/node_modules/@google/python-3.13.7
    const pythonSourceDir = path.join(__dirname, '../../python-3.13.7');
    const pythonTargetDir = path.join(resourcesDir, 'node_modules', '@google', 'python-3.13.7');

    log(`Copying Python from ${pythonSourceDir} to ${pythonTargetDir}`);

    if (fs.existsSync(pythonSourceDir)) {
      // Remove existing if present
      if (fs.existsSync(pythonTargetDir)) {
        fs.rmSync(pythonTargetDir, { recursive: true, force: true });
      }

      // Copy Python directory
      copyDirectory(pythonSourceDir, pythonTargetDir, [
        '__pycache__',
        'test',
        'tests'
      ]);

      const size = getFolderSize(pythonTargetDir);
      log(`✅ Python copied successfully (${(size / 1024 / 1024).toFixed(2)} MB)`);
    } else {
      log('⚠️ Python directory not found, skipping...');
    }

    // Copy dotnet-processor
    const dotnetSourceDir = path.join(__dirname, '../../core/dotnet-processor');
    const corePackageDir = path.join(resourcesDir, 'node_modules', '@google', 'gemini-cli-core');
    const dotnetTargetDir = path.join(corePackageDir, 'dotnet-processor');

    log(`Copying dotnet-processor from ${dotnetSourceDir} to ${dotnetTargetDir}`);

    if (fs.existsSync(dotnetSourceDir)) {
      // Create parent directory
      const dotnetParent = path.dirname(dotnetTargetDir);
      if (!fs.existsSync(dotnetParent)) {
        fs.mkdirSync(dotnetParent, { recursive: true });
      }

      // Remove existing if present
      if (fs.existsSync(dotnetTargetDir)) {
        fs.rmSync(dotnetTargetDir, { recursive: true, force: true });
      }

      // Copy dotnet-processor directory
      copyDirectory(dotnetSourceDir, dotnetTargetDir, [
        'bin/Debug',
        'obj'
      ]);

      const dotnetSize = getFolderSize(dotnetTargetDir);
      log(`✅ dotnet-processor copied successfully (${(dotnetSize / 1024 / 1024).toFixed(2)} MB)`);
    } else {
      log('⚠️ dotnet-processor directory not found, skipping...');
    }

    // Copy pdf-parse test data (required by pdf-parse library)
    // pdf-parse looks for this file relative to app root, not in node_modules
    const pdfSourceFile = path.join(__dirname, '../../../node_modules/pdf-parse/test/data/05-versions-space.pdf');
    const pdfTargetDir = path.join(appOutDir, 'test/data');

    log(`Copying pdf-parse test data to app root...`);

    if (fs.existsSync(pdfSourceFile)) {
      if (!fs.existsSync(pdfTargetDir)) {
        fs.mkdirSync(pdfTargetDir, { recursive: true });
      }
      fs.copyFileSync(pdfSourceFile, path.join(pdfTargetDir, '05-versions-space.pdf'));
      log(`✅ pdf-parse test data copied to ${pdfTargetDir}`);
    } else {
      log('⚠️ pdf-parse test data not found, skipping...');
    }
  } catch (err) {
    error(`Failed to copy resources: ${err.message}`);
    throw err;
  }
}

function getFolderSize(folderPath) {
  let size = 0;

  try {
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        size += getFolderSize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch (err) {
    // Ignore errors
  }

  return size;
}

module.exports = copyPython;
