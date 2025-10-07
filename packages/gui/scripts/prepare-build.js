/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Prepare the build by bundling workspace dependencies
 * This script is run before electron-builder packages the app
 */

const log = (message) => {
  console.log(`[Prepare Build] ${message}`);
};

const error = (message) => {
  console.error(`[Prepare Build Error] ${message}`);
};

async function prepareBuild() {
  try {
    log('Starting build preparation...');

    const guiDir = path.join(__dirname, '..');
    const coreDir = path.join(__dirname, '../../core');
    const targetNodeModules = path.join(guiDir, 'node_modules', '@google');

    // Ensure core package is built
    log('Building core package...');
    try {
      execSync('npm run build', {
        cwd: coreDir,
        stdio: 'inherit'
      });
      log('✅ Core package built successfully');
    } catch (err) {
      error('Failed to build core package');
      throw err;
    }

    // Create @google directory in node_modules if it doesn't exist
    if (!fs.existsSync(targetNodeModules)) {
      fs.mkdirSync(targetNodeModules, { recursive: true });
      log('Created @google directory in node_modules');
    }

    // Copy built core package to node_modules
    const corePackageTarget = path.join(targetNodeModules, 'gemini-cli-core');

    log('Copying core package to node_modules...');

    // Remove existing if present
    if (fs.existsSync(corePackageTarget)) {
      fs.rmSync(corePackageTarget, { recursive: true, force: true });
    }

    // Copy core package (exclude source files and dev-only directories)
    // Note: dotnet-processor and temp are excluded here because:
    // - dotnet-processor is copied separately by copy-python.js afterPack hook
    // - temp directory contains runtime data not needed in package
    copyDirectory(coreDir, corePackageTarget, [
      'node_modules',
      'src',
      '.git',
      'coverage',
      'test',
      'dotnet-processor',
      'temp',
      'data',
      '.backups'
    ]);

    log('✅ Core package copied to node_modules');

    // Install core package dependencies
    log('Installing core package dependencies...');
    try {
      execSync('npm install --production --no-save', {
        cwd: corePackageTarget,
        stdio: 'inherit'
      });
      log('✅ Core dependencies installed');
    } catch (err) {
      error('Failed to install core dependencies');
      throw err;
    }

    log('✅ Build preparation completed successfully');
  } catch (err) {
    error(`Build preparation failed: ${err.message}`);
    process.exit(1);
  }
}

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

// Run if called directly
if (require.main === module) {
  prepareBuild();
}

module.exports = { prepareBuild };
