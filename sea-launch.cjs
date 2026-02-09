/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
const { getAsset } = require('node:sea');
const process = require('node:process');
const nodeModule = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

process.env.IS_BINARY = 'true';

if (nodeModule.enableCompileCache) {
  nodeModule.enableCompileCache();
}

process.noDeprecation = true;

// Node SEA sets argv[0] and argv[1] to the absolute path of the executable.
// Sometimes, argv[2] contains the relative command used to invoke it (e.g. "./dist/gemini").
// We must detect and remove this "ghost" argument so it isn't parsed as a user command.
if (process.argv.length > 2) {
  const binaryAbs = process.execPath;
  const arg2Abs = path.resolve(process.argv[2]);
  if (binaryAbs === arg2Abs) {
    process.argv.splice(2, 1);
  }
}

const manifestJson = getAsset('manifest.json', 'utf8');
if (!manifestJson) {
  console.error('Fatal Error: Corrupted binary. Please reinstall.');
  process.exit(1);
}

const manifest = JSON.parse(manifestJson);
let runtimeDir = process.env.GEMINI_SEA_RUNTIME_DIR;

const version = manifest.version || '0.0.0';
const safeVersion = version.replace(/[^a-zA-Z0-9.-]/g, '_');
const userInfo = os.userInfo();
const username =
  userInfo.username || process.env.USER || process.getuid?.() || 'unknown';
const safeUsername = username.toString().replace(/[^a-zA-Z0-9.-]/g, '_');

const tempBase = os.tmpdir();
const finalRuntimeDir = path.join(
  tempBase,
  `gemini-runtime-${safeVersion}-${safeUsername}`,
);

function verifyIntegrity(dir) {
  try {
    const sha256 = (content) =>
      crypto.createHash('sha256').update(content).digest('hex');
    const mainContent = fs.readFileSync(path.join(dir, 'gemini.mjs'));
    if (sha256(mainContent) !== manifest.mainHash) return false;
    if (manifest.files) {
      for (const file of manifest.files) {
        const content = fs.readFileSync(path.join(dir, file.path));
        if (sha256(content) !== file.hash) return false;
      }
    }
    return true;
  } catch (_e) {
    return false;
  }
}

if (!runtimeDir) {
  let useExisting = false;
  if (fs.existsSync(finalRuntimeDir)) {
    if (verifyIntegrity(finalRuntimeDir)) {
      runtimeDir = finalRuntimeDir;
      useExisting = true;
    } else {
      try {
        fs.rmSync(finalRuntimeDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  if (!useExisting) {
    const setupDir = path.join(
      tempBase,
      `gemini-setup-${process.pid}-${Date.now()}`,
    );

    try {
      fs.mkdirSync(setupDir, { recursive: true, mode: 0o700 });
      const writeToSetup = (assetKey, relPath) => {
        const content = getAsset(assetKey);
        if (!content) return;
        const destPath = path.join(setupDir, relPath);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir))
          fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(destPath, new Uint8Array(content), { mode: 0o755 });
      };
      writeToSetup('gemini.mjs', 'gemini.mjs');
      if (manifest.files) {
        for (const file of manifest.files) {
          writeToSetup(file.key, file.path);
        }
      }
      try {
        fs.renameSync(setupDir, finalRuntimeDir);
        runtimeDir = finalRuntimeDir;
      } catch (renameErr) {
        if (
          fs.existsSync(finalRuntimeDir) &&
          verifyIntegrity(finalRuntimeDir)
        ) {
          runtimeDir = finalRuntimeDir;
          try {
            fs.rmSync(setupDir, { recursive: true, force: true });
          } catch (_) {}
        } else {
          throw renameErr;
        }
      }
    } catch (e) {
      console.error(
        'Fatal Error: Failed to setup secure runtime. Please try running again and error persists please reinstall.',
        e,
      );
      try {
        fs.rmSync(setupDir, { recursive: true, force: true });
      } catch (_) {}
      process.exit(1);
    }
  }

  process.env.GEMINI_SEA_RUNTIME_DIR = runtimeDir;
}

const mainPath = path.join(runtimeDir, 'gemini.mjs');

import(pathToFileURL(mainPath).href).catch((err) => {
  console.error('Fatal Error: Failed to launch. Please reinstall.', err);
  console.error(err);
  process.exit(1);
});
