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

// --- Helper Functions ---

/**
 * Strips the "ghost" argument that Node SEA sometimes injects (argv[2] == argv[0]).
 * @param {string[]} argv
 * @param {string} execPath
 * @param {function} resolveFn
 * @returns {boolean} True if an argument was removed.
 */
function sanitizeArgv(argv, execPath, resolveFn = path.resolve) {
  if (argv.length > 2) {
    const binaryAbs = execPath;
    const arg2Abs = resolveFn(argv[2]);
    if (binaryAbs === arg2Abs) {
      argv.splice(2, 1);
      return true;
    }
  }
  return false;
}

/**
 * Sanitizes a string for use in file paths.
 * @param {string} name
 * @returns {string}
 */
function getSafeName(name) {
  return (name || 'unknown').toString().replace(/[^a-zA-Z0-9.-]/g, '_');
}

/**
 * Verifies the integrity of the runtime directory against the manifest.
 * @param {string} dir
 * @param {object} manifest
 * @param {object} fsMod
 * @param {object} cryptoMod
 * @returns {boolean}
 */
function verifyIntegrity(dir, manifest, fsMod = fs, cryptoMod = crypto) {
  try {
    const sha256 = (content) =>
      cryptoMod.createHash('sha256').update(content).digest('hex');
    const mainContent = fsMod.readFileSync(path.join(dir, 'gemini.mjs'));
    if (sha256(mainContent) !== manifest.mainHash) return false;
    if (manifest.files) {
      for (const file of manifest.files) {
        const content = fsMod.readFileSync(path.join(dir, file.path));
        if (sha256(content) !== file.hash) return false;
      }
    }
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Prepares the runtime directory, extracting assets if necessary.
 * @param {object} manifest
 * @param {function} getAssetFn
 * @param {object} deps Dependencies (fs, os, path, processEnv)
 * @returns {string} The path to the prepared runtime directory.
 */
function prepareRuntime(manifest, getAssetFn, deps = {}) {
  const fsMod = deps.fs || fs;
  const osMod = deps.os || os;
  const pathMod = deps.path || path;
  const processEnv = deps.processEnv || process.env;
  const processPid = deps.processPid || process.pid;
  const processUid =
    deps.processUid || (process.getuid ? process.getuid() : 'unknown');

  const version = manifest.version || '0.0.0';
  const safeVersion = getSafeName(version);
  const userInfo = osMod.userInfo();
  const username =
    userInfo.username || processEnv.USER || processUid || 'unknown';
  const safeUsername = getSafeName(username);

  const tempBase = osMod.tmpdir();
  const finalRuntimeDir = pathMod.join(
    tempBase,
    `gemini-runtime-${safeVersion}-${safeUsername}`,
  );

  let runtimeDir;
  let useExisting = false;

  const isSecure = (dir) => {
    try {
      const stat = fsMod.lstatSync(dir);
      if (!stat.isDirectory()) return false;
      if (processUid !== 'unknown' && stat.uid !== processUid) return false;
      // Skip strict permission check on Windows as it's unreliable with standard fs.stat
      if (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o700)
        return false;
      return true;
    } catch (_) {
      return false;
    }
  };
  if (fsMod.existsSync(finalRuntimeDir)) {
    if (isSecure(finalRuntimeDir)) {
      if (
        verifyIntegrity(finalRuntimeDir, manifest, fsMod, deps.crypto || crypto)
      ) {
        runtimeDir = finalRuntimeDir;
        useExisting = true;
      } else {
        try {
          fsMod.rmSync(finalRuntimeDir, { recursive: true, force: true });
        } catch (_) {}
      }
    } else {
      try {
        fsMod.rmSync(finalRuntimeDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  if (!useExisting) {
    const setupDir = pathMod.join(
      tempBase,
      `gemini-setup-${processPid}-${Date.now()}`,
    );

    try {
      fsMod.mkdirSync(setupDir, { recursive: true, mode: 0o700 });
      const writeToSetup = (assetKey, relPath) => {
        const content = getAssetFn(assetKey);
        if (!content) return;
        const destPath = pathMod.join(setupDir, relPath);
        const destDir = pathMod.dirname(destPath);
        if (!fsMod.existsSync(destDir))
          fsMod.mkdirSync(destDir, { recursive: true, mode: 0o700 });
        fsMod.writeFileSync(destPath, new Uint8Array(content), {
          mode: 0o755,
        });
      };
      writeToSetup('gemini.mjs', 'gemini.mjs');
      if (manifest.files) {
        for (const file of manifest.files) {
          writeToSetup(file.key, file.path);
        }
      }
      try {
        fsMod.renameSync(setupDir, finalRuntimeDir);
        runtimeDir = finalRuntimeDir;
      } catch (renameErr) {
        if (
          fsMod.existsSync(finalRuntimeDir) &&
          isSecure(finalRuntimeDir) &&
          verifyIntegrity(
            finalRuntimeDir,
            manifest,
            fsMod,
            deps.crypto || crypto,
          )
        ) {
          runtimeDir = finalRuntimeDir;
          try {
            fsMod.rmSync(setupDir, { recursive: true, force: true });
          } catch (_) {}
        } else {
          throw renameErr;
        }
      }
    } catch (e) {
      console.error(
        'Fatal Error: Failed to setup secure runtime. Please try running again and if error persists please reinstall.',
        e,
      );
      try {
        fsMod.rmSync(setupDir, { recursive: true, force: true });
      } catch (_) {}
      process.exit(1);
    }
  }

  return runtimeDir;
}

// --- Main Execution ---

async function main(getAssetFn = getAsset) {
  process.env.IS_BINARY = 'true';

  if (nodeModule.enableCompileCache) {
    nodeModule.enableCompileCache();
  }

  process.noDeprecation = true;

  sanitizeArgv(process.argv, process.execPath);

  const manifestJson = getAssetFn('manifest.json', 'utf8');
  if (!manifestJson) {
    console.error('Fatal Error: Corrupted binary. Please reinstall.');
    process.exit(1);
  }

  const manifest = JSON.parse(manifestJson);

  const runtimeDir = prepareRuntime(manifest, getAssetFn, {
    fs,
    os,
    path,
    processEnv: process.env,
    crypto,
  });

  const mainPath = path.join(runtimeDir, 'gemini.mjs');

  await import(pathToFileURL(mainPath).href).catch((err) => {
    console.error('Fatal Error: Failed to launch. Please reinstall.', err);
    console.error(err);
    process.exit(1);
  });
}

// Only execute if this is the main module (standard Node behavior)
// or if explicitly running as the SEA entry point (heuristic).
if (require.main === module) {
  main().catch((err) => {
    console.error('Unhandled error in sea-launch:', err);
    process.exit(1);
  });
}

module.exports = {
  sanitizeArgv,
  getSafeName,
  verifyIntegrity,
  prepareRuntime,
  main,
};
