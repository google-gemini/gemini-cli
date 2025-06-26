/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cliPackageJsonPath = path.resolve(
  __dirname,
  '../packages/cli/package.json',
);
const cliPackageJson = JSON.parse(fs.readFileSync(cliPackageJsonPath, 'utf8'));

// Get version from root package.json (accessible via env var in npm scripts)
const version = process.env.npm_package_version;

// Get Docker registry and image name directly from PUBLISH_ environment variables.
// These are expected to be set by the CI/build environment.
const containerImageRegistry = process.env.SANDBOX_IMAGE_REGISTRY;
const containerImageName = process.env.SANDBOX_IMAGE_NAME;

if (!version || !containerImageRegistry || !containerImageName) {
  console.error(
    'Error: Missing required environment variables. Need: ' +
      'npm_package_version, SANDBOX_IMAGE_REGISTRY, and SANDBOX_IMAGE_NAME.',
  );
  console.error(
    'These should be passed from the CI environment (e.g., Cloud Build substitutions) ' +
      'to the npm publish:release script.',
  );
  process.exit(1);
}

const containerImageUri = `${containerImageRegistry}/${containerImageName}:${version}`;

// Add or update fields in cliPackageJson.config to store this information
if (!cliPackageJson.config) {
  cliPackageJson.config = {};
}
cliPackageJson.config.sandboxImageUri = containerImageUri;

// Remove 'prepublishOnly' from scripts if it exists
if (cliPackageJson.scripts && cliPackageJson.scripts.prepublishOnly) {
  delete cliPackageJson.scripts.prepublishOnly;
  console.log('Removed prepublishOnly script from packages/cli/package.json');
}

fs.writeFileSync(
  cliPackageJsonPath,
  JSON.stringify(cliPackageJson, null, 2) + '\n',
);
console.log(
  `Updated ${path.relative(process.cwd(), cliPackageJsonPath)} with Docker image details:`,
);
console.log(`  URI: ${containerImageUri}`);
console.log(`  Registry: ${containerImageRegistry}`);
console.log(`  Image Name: ${containerImageName}`);

// Copy README.md to packages/cli
const rootReadmePath = path.resolve(__dirname, '../README.md');
const cliReadmePath = path.resolve(__dirname, '../packages/cli/README.md');

try {
  fs.copyFileSync(rootReadmePath, cliReadmePath);
  console.log('Copied root README.md to packages/cli/');
} catch (err) {
  console.error('Error copying README.md:', err);
  process.exit(1);
}
