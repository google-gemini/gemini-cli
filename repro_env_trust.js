
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadSettings } from './packages/cli/src/config/settings.js';
import { resetTrustedFoldersForTesting } from '@google/gemini-cli-core';

async function runReproduction() {
  const tmpDir = path.join(process.cwd(), 'repro_untrusted');
  const geminiDir = path.join(tmpDir, '.gemini');
  const envFile = path.join(geminiDir, '.env');

  // 1. Setup untrusted workspace
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
  fs.mkdirSync(geminiDir, { recursive: true });

  // 2. Set a unique environment variable in .gemini/.env
  const SECRET_KEY = 'REPRO_SECRET_123';
  fs.writeFileSync(envFile, `REPRO_VARIABLE=${SECRET_KEY}\n`);

  // 3. Ensure the folder is NOT trusted
  resetTrustedFoldersForTesting();

  console.log('--- Reproduction Start ---');
  console.log(`Workspace: ${tmpDir}`);
  console.log(`Environment variable REPRO_VARIABLE before load: ${process.env['REPRO_VARIABLE']}`);

  // 4. Load settings (this triggers loadEnvironment)
  // We mock the process.cwd() to the untrusted directory
  const originalCwd = process.cwd();
  process.chdir(tmpDir);

  try {
    const settings = loadSettings();
    console.log(`Trust Status: ${settings.isTrusted}`);
    console.log(`Environment variable REPRO_VARIABLE after load: ${process.env['REPRO_VARIABLE']}`);

    if (process.env['REPRO_VARIABLE'] === SECRET_KEY) {
      console.log('RESULT: .env was LOADED in untrusted workspace.');
    } else {
      console.log('RESULT: .env was NOT loaded (or was restricted).');
    }
  } finally {
    process.chdir(originalCwd);
    // Cleanup
    // fs.rmSync(tmpDir, { recursive: true });
  }
}

runReproduction().catch(console.error);
