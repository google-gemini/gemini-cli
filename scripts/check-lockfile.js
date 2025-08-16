import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const lockfilePath = join(root, 'package-lock.json');

function readJsonFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading or parsing ${filePath}:`, error);
    process.exit(1);
  }
}

console.log('Checking lockfile...');

const lockfile = readJsonFile(lockfilePath);
const packages = lockfile.packages || {};
const invalidPackages = [];

for (const [location, details] of Object.entries(packages)) {
  // 1. Skip the root package itself.
  if (location === '') {
    continue;
  }

  // 2. Skip local workspace packages.
  // They are identifiable in two ways:
  // a) As a symlink within node_modules.
  // b) As the source package definition, whose path is not in node_modules.
  if (details.link === true || !location.includes('node_modules')) {
    continue;
  }

  // 3. Any remaining package should be a third-party dependency.
  // 1) Registry package with both "resolved" and "integrity" fields is valid.
  // 2) Git and file dependencies only need a "resolved" field.
  const isValidRegistryPackage = details.resolved && details.integrity;
  const isValidGitOrFileDep = details.resolved?.startsWith('git') || details.resolved?.startsWith('file:');
  if (isValidRegistryPackage || isValidGitOrFileDep) {
    continue;
  }

  // Mark the left dependency as invalid.
  invalidPackages.push(location);
}

if (invalidPackages.length > 0) {
  console.error(
    '\nError: The following dependencies in package-lock.json are missing the "resolved" or "integrity" field:',
  );
  invalidPackages.forEach((pkg) => console.error(`- ${pkg}`));
  process.exit(1);
} else {
  console.log('Lockfile check passed.');
  process.exit(0);
}
