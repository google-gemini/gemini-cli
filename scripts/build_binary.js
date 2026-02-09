/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  rmSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { globSync } from 'glob';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'dist');
const bundleDir = join(root, 'bundle');
const stagingDir = join(bundleDir, 'native_modules');
const seaConfigPath = join(root, 'sea-config.json');
const manifestPath = join(bundleDir, 'manifest.json');
const entitlementsPath = join(root, 'scripts/entitlements.plist');

// --- Helper Functions ---

/**
 * Safely executes a command using spawnSync.
 * @param {string} command
 * @param {string[]} args
 * @param {object} options
 */
function runCommand(command, args, options = {}) {
  const finalOptions = {
    stdio: 'inherit',
    cwd: root,
    shell: true,
    ...options,
  };

  const result = spawnSync(command, args, finalOptions);

  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(
      `Command failed with exit code ${result.status}: ${command} ${args.join(' ')}`,
    );
  }

  return result;
}

/**
 * Removes existing digital signatures from a binary.
 * @param {string} filePath
 */
function removeSignature(filePath) {
  console.log(`Removing signature from ${filePath}...`);
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      spawnSync('codesign', ['--remove-signature', filePath], {
        stdio: 'ignore',
        shell: true,
      });
    } else if (platform === 'win32') {
      spawnSync('signtool', ['remove', '/s', filePath], {
        stdio: 'ignore',
        shell: true,
      });
    }
  } catch {
    // Best effort: Ignore failures
  }
}

/**
 * Signs a binary using hardcoded tools for the platform.
 * @param {string} filePath
 */
function signFile(filePath) {
  const platform = process.platform;

  if (platform === 'darwin') {
    const identity = process.env.APPLE_IDENTITY || '-';
    console.log(`Signing ${filePath} (Identity: ${identity})...`);

    const args = [
      '--sign',
      identity,
      '--force',
      '--timestamp',
      '--options',
      'runtime',
    ];

    if (existsSync(entitlementsPath)) {
      args.push('--entitlements', entitlementsPath);
    }

    args.push(filePath);

    runCommand('codesign', args);
  } else if (platform === 'win32') {
    const args = ['sign'];

    if (process.env.WINDOWS_PFX_FILE && process.env.WINDOWS_PFX_PASSWORD) {
      args.push(
        '/f',
        process.env.WINDOWS_PFX_FILE,
        '/p',
        process.env.WINDOWS_PFX_PASSWORD,
      );
    } else {
      args.push('/a');
    }

    args.push(
      '/fd',
      'SHA256',
      '/td',
      'SHA256',
      '/tr',
      'http://timestamp.digicert.com',
      filePath,
    );

    console.log(`Signing ${filePath}...`);
    try {
      runCommand('signtool', args);
    } catch (e) {
      let msg = e.message;
      if (process.env.WINDOWS_PFX_PASSWORD) {
        msg = msg.replaceAll(process.env.WINDOWS_PFX_PASSWORD, '******');
      }
      throw new Error(msg);
    }
  } else if (platform === 'linux') {
    console.log(`Skipping signing for ${filePath} on Linux.`);
  }
}

console.log('Build Binary Script Started...');

// 1. Clean dist
if (existsSync(distDir)) {
  console.log('Cleaning dist directory...');
  rmSync(distDir, { recursive: true, force: true });
}
mkdirSync(distDir, { recursive: true });

// 2. Build Bundle
console.log('Running npm clean, install, and bundle...');
try {
  runCommand('npm', ['run', 'clean']);
  runCommand('npm', ['install']);
  runCommand('npm', ['run', 'bundle']);
} catch (e) {
  console.error('Build step failed:', e.message);
  process.exit(1);
}

// 3. Stage & Sign Native Modules
const includeNativeModules = process.env.BUNDLE_NATIVE_MODULES !== 'false';
console.log(`Include Native Modules: ${includeNativeModules}`);

if (includeNativeModules) {
  console.log('Staging and signing native modules...');
  // Prepare staging
  if (existsSync(stagingDir))
    rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  // Copy @lydell/node-pty to staging
  const lydellSrc = join(root, 'node_modules/@lydell');
  const lydellStaging = join(stagingDir, 'node_modules/@lydell');

  if (existsSync(lydellSrc)) {
    mkdirSync(dirname(lydellStaging), { recursive: true });
    cpSync(lydellSrc, lydellStaging, { recursive: true });
  } else {
    console.warn(
      'Warning: @lydell/node-pty not found in node_modules. Native terminal features may fail.',
    );
  }

  // Sign Staged .node files
  try {
    const nodeFiles = globSync('**/*.node', {
      cwd: stagingDir,
      absolute: true,
    });
    for (const file of nodeFiles) {
      signFile(file);
    }
  } catch (e) {
    console.warn('Warning: Failed to sign native modules:', e.message);
  }
} else {
  console.log('Skipping native modules bundling (BUNDLE_NATIVE_MODULES=false)');
}

// 4. Generate SEA Configuration and Manifest
console.log('Generating SEA configuration and manifest...');
const packageJson = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
);

// Helper to calc hash
const sha256 = (content) => createHash('sha256').update(content).digest('hex');

// Read Main Bundle
const geminiBundlePath = join(root, 'bundle/gemini.js');
const geminiContent = readFileSync(geminiBundlePath);
const geminiHash = sha256(geminiContent);

const assets = {
  'gemini.mjs': geminiBundlePath, // Use .js source but map to .mjs for runtime ESM
  'manifest.json': 'bundle/manifest.json',
};

const manifest = {
  main: 'gemini.mjs',
  mainHash: geminiHash,
  version: packageJson.version,
  files: [],
};

// Helper to recursively find files from STAGING
function addAssetsFromDir(baseDir, runtimePrefix) {
  const fullDir = join(stagingDir, baseDir);
  if (!existsSync(fullDir)) return;

  const items = globSync('**/*', { cwd: fullDir, nodir: true });
  for (const item of items) {
    const relativePath = join(runtimePrefix, item);
    const assetKey = `files:${relativePath}`;
    const fsPath = join(fullDir, item);

    // Calc hash
    const content = readFileSync(fsPath);
    const hash = sha256(content);

    assets[assetKey] = fsPath;
    manifest.files.push({ key: assetKey, path: relativePath, hash: hash });
  }
}

// Add sb files
const sbFiles = globSync('sandbox-macos-*.sb', { cwd: bundleDir });
for (const sbFile of sbFiles) {
  const fsPath = join(bundleDir, sbFile);
  const content = readFileSync(fsPath);
  const hash = sha256(content);
  assets[sbFile] = fsPath;
  manifest.files.push({ key: sbFile, path: sbFile, hash: hash });
}

// Add policy files
const policyDir = join(bundleDir, 'policies');
if (existsSync(policyDir)) {
  const policyFiles = globSync('*.toml', { cwd: policyDir });
  for (const policyFile of policyFiles) {
    const fsPath = join(policyDir, policyFile);
    const relativePath = join('policies', policyFile);
    const content = readFileSync(fsPath);
    const hash = sha256(content);
    // Use a unique key to avoid collision if filenames overlap (though unlikely here)
    // But sea-launch writes to 'path', so key is just for lookup.
    const assetKey = `policies:${policyFile}`;
    assets[assetKey] = fsPath;
    manifest.files.push({ key: assetKey, path: relativePath, hash: hash });
  }
}

// Add assets from Staging
if (includeNativeModules) {
  addAssetsFromDir('node_modules/@lydell', 'node_modules/@lydell');
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const seaConfig = {
  main: 'sea-launch.cjs',
  output: 'dist/sea-prep.blob',
  disableExperimentalSEAWarning: true,
  assets: assets,
};

writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));
console.log(`Configured ${Object.keys(assets).length} embedded assets.`);

// 5. Generate SEA Blob
console.log('Generating SEA blob...');
try {
  runCommand('node', ['--experimental-sea-config', 'sea-config.json']);
} catch (e) {
  console.error('Failed to generate SEA blob:', e.message);
  // Cleanup
  if (existsSync(seaConfigPath)) rmSync(seaConfigPath);
  if (existsSync(manifestPath)) rmSync(manifestPath);
  if (existsSync(stagingDir))
    rmSync(stagingDir, { recursive: true, force: true });
  process.exit(1);
}

// Check blob existence
const blobPath = join(distDir, 'sea-prep.blob');
if (!existsSync(blobPath)) {
  console.error('Error: sea-prep.blob not found in dist/');
  process.exit(1);
}

// 6. Identify Target & Prepare Binary
const platform = process.platform;
const arch = process.arch;
const targetName = `${platform}-${arch}`;
console.log(`Targeting: ${targetName}`);

const targetDir = join(distDir, targetName);
mkdirSync(targetDir, { recursive: true });

const nodeBinary = process.execPath;
const binaryName = platform === 'win32' ? 'gemini.exe' : 'gemini';
const targetBinaryPath = join(targetDir, binaryName);

console.log(`Copying node binary from ${nodeBinary} to ${targetBinaryPath}...`);
copyFileSync(nodeBinary, targetBinaryPath);

// Remove existing signature using helper
removeSignature(targetBinaryPath);

// Copy standard bundle assets (policies, .sb files)
console.log('Copying additional resources...');
if (existsSync(bundleDir)) {
  cpSync(bundleDir, targetDir, { recursive: true });
}

// Clean up source JS files from output (we only want embedded)
const filesToRemove = [
  'gemini.js',
  'gemini.mjs',
  'gemini.js.map',
  'gemini.mjs.map',
  'gemini-sea.cjs',
  'sea-launch.cjs',
  'manifest.json',
  'native_modules',
  'policies',
];

filesToRemove.forEach((f) => {
  const p = join(targetDir, f);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
});

// Remove .sb files from targetDir
const sbFilesToRemove = globSync('sandbox-macos-*.sb', { cwd: targetDir });
for (const f of sbFilesToRemove) {
  rmSync(join(targetDir, f));
}

// 7. Inject Blob
console.log('Injecting SEA blob...');
const sentinelFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

try {
  const args = [
    'postject',
    targetBinaryPath,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    sentinelFuse,
  ];

  if (platform === 'darwin') {
    args.push('--macho-segment-name', 'NODE_SEA');
  }

  runCommand('npx', args);
  console.log('Injection successful.');
} catch (e) {
  console.error('Postject failed:', e.message);
  process.exit(1);
}

// 8. Final Signing
console.log('Signing final executable...');
try {
  signFile(targetBinaryPath);
} catch (e) {
  console.warn('Warning: Final signing failed:', e.message);
  console.warn('Continuing without signing...');
}

// 9. Cleanup
console.log('Cleaning up artifacts...');
rmSync(blobPath);
if (existsSync(seaConfigPath)) rmSync(seaConfigPath);
if (existsSync(manifestPath)) rmSync(manifestPath);
if (existsSync(stagingDir))
  rmSync(stagingDir, { recursive: true, force: true });

console.log(`Binary built successfully in ${targetDir}`);
