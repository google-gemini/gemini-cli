/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Clean up the temporary node_modules/@google directory created by prepare-build.js
 * This restores the development environment after building
 */

const log = (message) => {
  console.log(`[Clean Dist] ${message}`);
};

function cleanDistDeps() {
  try {
    const targetDir = path.join(__dirname, '..', 'node_modules', '@google');

    if (fs.existsSync(targetDir)) {
      log('Removing temporary @google dependencies...');
      fs.rmSync(targetDir, { recursive: true, force: true });
      log('✅ Temporary dependencies removed');
    } else {
      log('No temporary dependencies to clean');
    }
  } catch (err) {
    console.error(`[Clean Dist Error] ${err.message}`);
    // Don't fail the build if cleanup fails
  }
}

// Run if called directly
if (require.main === module) {
  cleanDistDeps();
}

module.exports = { cleanDistDeps };
