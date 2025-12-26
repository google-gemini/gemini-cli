const { getAsset } = require('node:sea');
const process = require('node:process');
const nodeModule = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const os = require('node:os');

// --- 1. Environment Setup ---
// Signal that we are running as a standalone binary
process.env.IS_BINARY = 'true';

// Enable Bytecode Caching (Node v22.8.0+) for faster startup
if (nodeModule.enableCompileCache) {
  nodeModule.enableCompileCache();
}

// Suppress deprecation warnings (cleaner CLI output)
process.noDeprecation = true;

// --- 2. Argument Sanitization ---
// Node SEA sets argv[0] and argv[1] to the absolute path of the executable.
// Sometimes, argv[2] contains the relative command used to invoke it (e.g. "./dist/gemini").
// We must detect and remove this "ghost" argument so it isn't parsed as a user command.
if (process.argv.length > 2) {
  const binaryAbs = process.execPath; // The running binary
  const arg2Abs = path.resolve(process.argv[2]); // The 3rd argument resolved

  // If the 3rd argument points to the binary itself, it's a ghost. Remove it.
  if (binaryAbs === arg2Abs) {
    process.argv.splice(2, 1);
  }
}

// --- 3. Load Embedded Application ---
// Read the manifest to understand the embedded file structure
const manifestJson = getAsset('manifest.json', 'utf8');
if (!manifestJson) {
  console.error('Fatal Error: Embedded manifest.json not found.');
  process.exit(1);
}
const manifest = JSON.parse(manifestJson);

const crypto = require('node:crypto');

// Create a unique temporary runtime directory
// Optimization: Check if we are a child process inheriting a runtime env
let runtimeDir = process.env.GEMINI_SEA_RUNTIME_DIR;

// Security & Persistence Strategy:
// 1. Versioned: stable across runs of same version (caching).
// 2. User-Scoped: includes username to prevent sharing/attacks in /tmp.
// 3. Integrity-Checked: verifies hashes of all files before execution.

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

// Integrity Verification Helper
function verifyIntegrity(dir) {
  try {
    const sha256 = (content) =>
      crypto.createHash('sha256').update(content).digest('hex');

    // Verify Main Bundle
    const mainContent = fs.readFileSync(path.join(dir, 'gemini.mjs'));
    if (sha256(mainContent) !== manifest.mainHash) return false;

    // Verify Files
    if (manifest.files) {
      for (const file of manifest.files) {
        const content = fs.readFileSync(path.join(dir, file.path));
        if (sha256(content) !== file.hash) return false;
      }
    }
    return true;
  } catch (e) {
    return false; // Read error (missing file, etc)
  }
}

if (!runtimeDir) {
  let useExisting = false;

  // 1. Check existing directory
  if (fs.existsSync(finalRuntimeDir)) {
    if (verifyIntegrity(finalRuntimeDir)) {
      runtimeDir = finalRuntimeDir;
      useExisting = true;
    } else {
      // Corrupt or Tampered. Nuke it.
      try {
        fs.rmSync(finalRuntimeDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  // 2. Create if needed
  if (!useExisting) {
    // Atomic Strategy: Extract to temp -> Rename
    const setupDir = path.join(
      tempBase,
      `gemini-setup-${process.pid}-${Date.now()}`,
    );

    try {
      // Secure permissions: 0700 (User only)
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

      // Extract
      writeToSetup('gemini.mjs', 'gemini.mjs');
      if (manifest.files) {
        for (const file of manifest.files) {
          writeToSetup(file.key, file.path);
        }
      }

      // Atomic Rename
      try {
        fs.renameSync(setupDir, finalRuntimeDir);
        runtimeDir = finalRuntimeDir;
      } catch (renameErr) {
        // Race condition
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
      console.error('Fatal Error: Failed to setup secure runtime.', e);
      try {
        fs.rmSync(setupDir, { recursive: true, force: true });
      } catch (_) {}
      process.exit(1);
    }
  }

  process.env.GEMINI_SEA_RUNTIME_DIR = runtimeDir;
}

// NOTE: No cleanup on exit. Persistence enables caching.

// Import the app from the runtime environment
const mainPath = path.join(runtimeDir, 'gemini.mjs');

import(pathToFileURL(mainPath).href).catch((err) => {
  console.error('Fatal Error: Failed to launch embedded application.');
  console.error(err);
  process.exit(1);
});
