/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  rmSync,
  cpSync,
  mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

const inkRepo = 'https://github.com/jacob314/ink.git';
const inkCommit = '445a52b5e032d8ed2262c8ef7556d59364f0a7b8';
const vendorDir = join(root, 'third_party');
const inkDir = join(vendorDir, 'ink');

async function main() {
  console.log(
    'Ensuring vendored ink dependency is clean by starting from scratch...',
  );
  // Simple, non-idempotent approach: always remove and re-clone.
  rmSync(inkDir, { recursive: true, force: true });

  console.log(`Cloning ink repository into ${inkDir}...`);
  execFileSync('git', ['clone', inkRepo, inkDir], { stdio: 'inherit' });

  console.log(`Checking out ink commit ${inkCommit}...`);
  execFileSync('git', ['checkout', inkCommit], {
    stdio: 'inherit',
    cwd: inkDir,
  });

  console.log('Installing ink dependencies and building...');
  execSync('npm install', { stdio: 'inherit', cwd: inkDir });
  execSync('npm shrinkwrap', { stdio: 'inherit', cwd: inkDir });
  execSync('npm run build', { stdio: 'inherit', cwd: inkDir });

  console.log('Copying build artifacts to dist directory...');
  const distDir = join(inkDir, 'dist');
  mkdirSync(distDir, { recursive: true });
  cpSync(join(inkDir, 'build'), join(distDir, 'build'), { recursive: true });

  console.log('Bundling and minifying ink...');
  await esbuild.build({
    entryPoints: [join(distDir, 'build', 'index.js')],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'node',
    outfile: join(distDir, 'ink.bundle.js'),
    external: ['react', 'react-devtools-core'],
  });

  console.log(
    'Moving build artifacts to a temp directory and removing all other files...',
  );
  const tmpDir = join(vendorDir, 'tmp_ink');
  cpSync(join(inkDir, 'dist'), tmpDir, { recursive: true });
  const packageJson = readFileSync(join(inkDir, 'package.json'), 'utf-8');
  const license = readFileSync(join(inkDir, 'license'), 'utf-8');

  execSync('git rm -rf .', { stdio: 'inherit', cwd: inkDir });

  console.log('Restoring build artifacts, license, and package.json...');
  rmSync(join(inkDir, 'dist'), { recursive: true, force: true });
  cpSync(tmpDir, join(inkDir, 'dist'), { recursive: true });
  rmSync(tmpDir, { recursive: true, force: true });
  writeFileSync(join(inkDir, 'package.json'), packageJson);
  writeFileSync(join(inkDir, 'license'), license);

  console.log('Cleaning up .git and node_modules directories...');
  rmSync(join(inkDir, '.git'), { recursive: true, force: true });
  rmSync(join(inkDir, 'node_modules'), { recursive: true, force: true });
  rmSync(join(inkDir, 'build'), { recursive: true, force: true });

  console.log('Removing prepare script from ink package.json...');
  const inkPackageJsonPath = join(inkDir, 'package.json');
  const inkPackageJson = JSON.parse(readFileSync(inkPackageJsonPath, 'utf-8'));
  delete inkPackageJson.scripts.prepare;
  writeFileSync(
    inkPackageJsonPath,
    JSON.stringify(inkPackageJson, null, 2) + '\n',
  );
}

main();
