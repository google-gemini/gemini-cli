#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const projectHash = crypto
  .createHash('sha256')
  .update(projectRoot)
  .digest('hex');

// User-level .gemini directory in home
const USER_GEMINI_DIR = path.join(os.homedir(), '.gemini');
// Project-level .gemini directory in the workspace
const WORKSPACE_GEMINI_DIR = path.join(projectRoot, '.gemini');

// Telemetry artifacts are stored in a hashed directory under the user's ~/.gemini/tmp
export const OTEL_DIR = path.join(USER_GEMINI_DIR, 'tmp', projectHash, 'otel');
export const BIN_DIR = path.join(OTEL_DIR, 'bin');

// Workspace settings remain in the project's .gemini directory
export const WORKSPACE_SETTINGS_FILE = path.join(
  WORKSPACE_GEMINI_DIR,
  'settings.json',
);

export function getJson(url) {
  const tmpFile = path.join(
    os.tmpdir(),
    `gemini-cli-releases-${Date.now()}.json`,
  );
  try {
    execSync(
      `curl -sL -H "User-Agent: gemini-cli-dev-script" -o "${tmpFile}" "${url}"`,
      { stdio: 'pipe' },
    );
    const content = fs.readFileSync(tmpFile, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Failed to fetch or parse JSON from ${url}`);
    throw e;
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}

export function downloadFile(url, dest) {
  try {
    execSync(`curl -fL -sS -o "${dest}" "${url}"`, {
      stdio: 'pipe',
    });
    return dest;
  } catch (e) {
    console.error(`Failed to download file from ${url}`);
    throw e;
  }
}

export function findFile(startPath, filter) {
  if (!fs.existsSync(startPath)) {
    return null;
  }
  const files = fs.readdirSync(startPath);
  for (const file of files) {
    const filename = path.join(startPath, file);
    const stat = fs.lstatSync(filename);
    if (stat.isDirectory()) {
      const result = findFile(filename, filter);
      if (result) return result;
    } else if (filter(file)) {
      return filename;
    }
  }
  return null;
}

export function fileExists(filePath) {
  return fs.existsSync(filePath);
}

export function readJsonFile(filePath) {
  if (!fileExists(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error(`Error parsing JSON from ${filePath}: ${e.message}`);
    return {};
  }
}

export function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function moveBinary(source, destination) {
  try {
    fs.renameSync(source, destination);
  } catch (error) {
    if (error.code !== 'EXDEV') {
      throw error;
    }
    // Handle a cross-device error: copy-to-temp-then-rename.
    const destDir = path.dirname(destination);
    const destFile = path.basename(destination);
    const tempDest = path.join(destDir, `${destFile}.tmp`);

    try {
      fs.copyFileSync(source, tempDest);
      fs.renameSync(tempDest, destination);
    } catch (moveError) {
      // If copy or rename fails, clean up the intermediate temp file.
      if (fs.existsSync(tempDest)) {
        fs.unlinkSync(tempDest);
      }
      throw moveError;
    }
    fs.unlinkSync(source);
  }
}

export function waitForPort(port, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const tryConnect = () => {
      const socket = new net.Socket();
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', (_) => {
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for port ${port} to open.`));
        } else {
          setTimeout(tryConnect, 500);
        }
      });
      socket.connect(port, 'localhost');
    };
    tryConnect();
  });
}

export async function ensureBinary(
  executableName,
  repo,
  assetNameCallback,
  binaryNameInArchive,
  isJaeger = false,
) {
  const executablePath = path.join(BIN_DIR, executableName);
  if (fileExists(executablePath)) {
    console.log(`✅ ${executableName} already exists at ${executablePath}`);
    return executablePath;
  }

  console.log(`🔍 ${executableName} not found. Downloading from ${repo}...`);

  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const arch = process.arch === 'x64' ? 'amd64' : process.arch;
  const ext = platform === 'windows' ? 'zip' : 'tar.gz';

  if (isJaeger && platform === 'windows' && arch === 'arm64') {
    console.warn(
      `⚠️ Jaeger does not have a release for Windows on ARM64. Skipping.`,
    );
    return null;
  }

  let release;
  let asset;

  if (isJaeger) {
    console.log(`🔍 Finding latest Jaeger v2+ asset...`);
    const releases = getJson(`https://api.github.com/repos/${repo}/releases`);
    const sortedReleases = releases
      .filter((r) => !r.prerelease && r.tag_name.startsWith('v'))
      .sort((a, b) => {
        const aVersion = a.tag_name.substring(1).split('.').map(Number);
        const bVersion = b.tag_name.substring(1).split('.').map(Number);
        for (let i = 0; i < Math.max(aVersion.length, bVersion.length); i++) {
          if ((aVersion[i] || 0) > (bVersion[i] || 0)) return -1;
          if ((aVersion[i] || 0) < (bVersion[i] || 0)) return 1;
        }
        return 0;
      });

    for (const r of sortedReleases) {
      const expectedSuffix =
        platform === 'windows'
          ? `-${platform}-${arch}.zip`
          : `-${platform}-${arch}.tar.gz`;
      const foundAsset = r.assets.find(
        (a) =>
          a.name.startsWith('jaeger-2.') && a.name.endsWith(expectedSuffix),
      );

      if (foundAsset) {
        release = r;
        asset = foundAsset;
        console.log(
          `⬇️  Found ${asset.name} in release ${r.tag_name}, downloading...`,
        );
        break;
      }
    }
    if (!asset) {
      throw new Error(
        `Could not find a suitable Jaeger v2 asset for platform ${platform}/${arch}.`,
      );
    }
  } else {
    release = getJson(`https://api.github.com/repos/${repo}/releases/latest`);
    const version = release.tag_name.startsWith('v')
      ? release.tag_name.substring(1)
      : release.tag_name;
    const assetName = assetNameCallback(version, platform, arch, ext);
    asset = release.assets.find((a) => a.name === assetName);
    if (!asset) {
      throw new Error(
        `Could not find a suitable asset for ${repo} (version ${version}) on platform ${platform}/${arch}. Searched for: ${assetName}`,
      );
    }
  }

  const downloadUrl = asset.browser_download_url;
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gemini-cli-telemetry-'),
  );
  const archivePath = path.join(tmpDir, asset.name);

  try {
    console.log(`⬇️  Downloading ${asset.name}...`);
    downloadFile(downloadUrl, archivePath);
    console.log(`📦 Extracting ${asset.name}...`);

    const actualExt = asset.name.endsWith('.zip') ? 'zip' : 'tar.gz';

    if (actualExt === 'zip') {
      execSync(`unzip -o "${archivePath}" -d "${tmpDir}"`, { stdio: 'pipe' });
    } else {
      execSync(`tar -xzf "${archivePath}" -C "${tmpDir}"`, { stdio: 'pipe' });
    }

    const nameToFind = binaryNameInArchive || executableName;
    const foundBinaryPath = findFile(tmpDir, (file) => {
      if (platform === 'windows') {
        return file === `${nameToFind}.exe`;
      }
      return file === nameToFind;
    });

    if (!foundBinaryPath) {
      throw new Error(
        `Could not find binary "${nameToFind}" in extracted archive at ${tmpDir}. Contents: ${fs.readdirSync(tmpDir).join(', ')}`,
      );
    }

    moveBinary(foundBinaryPath, executablePath);

    if (platform !== 'windows') {
      fs.chmodSync(executablePath, '755');
    }

    console.log(`✅ ${executableName} installed at ${executablePath}`);
    return executablePath;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
  }
}

export function manageTelemetrySettings(
  enable,
  oTelEndpoint = 'http://localhost:4317',
  target = 'local',
  originalSandboxSettingToRestore,
) {
  const workspaceSettings = readJsonFile(WORKSPACE_SETTINGS_FILE);
  const currentSandboxSetting = workspaceSettings.sandbox;
  let settingsModified = false;

  if (typeof workspaceSettings.telemetry !== 'object') {
    workspaceSettings.telemetry = {};
  }

  if (enable) {
    if (workspaceSettings.telemetry.enabled !== true) {
      workspaceSettings.telemetry.enabled = true;
      settingsModified = true;
      console.log('⚙️  Enabled telemetry in workspace settings.');
    }
    if (workspaceSettings.sandbox !== false) {
      workspaceSettings.sandbox = false;
      settingsModified = true;
      console.log('✅ Disabled sandbox mode for telemetry.');
    }
    if (workspaceSettings.telemetry.otlpEndpoint !== oTelEndpoint) {
      workspaceSettings.telemetry.otlpEndpoint = oTelEndpoint;
      settingsModified = true;
      console.log(`🔧 Set telemetry OTLP endpoint to ${oTelEndpoint}.`);
    }
    if (workspaceSettings.telemetry.target !== target) {
      workspaceSettings.telemetry.target = target;
      settingsModified = true;
      console.log(`🎯 Set telemetry target to ${target}.`);
    }
  } else {
    if (workspaceSettings.telemetry.enabled === true) {
      delete workspaceSettings.telemetry.enabled;
      settingsModified = true;
      console.log('⚙️  Disabled telemetry in workspace settings.');
    }
    if (workspaceSettings.telemetry.otlpEndpoint) {
      delete workspaceSettings.telemetry.otlpEndpoint;
      settingsModified = true;
      console.log('🔧 Cleared telemetry OTLP endpoint.');
    }
    if (workspaceSettings.telemetry.target) {
      delete workspaceSettings.telemetry.target;
      settingsModified = true;
      console.log('🎯 Cleared telemetry target.');
    }
    if (Object.keys(workspaceSettings.telemetry).length === 0) {
      delete workspaceSettings.telemetry;
    }

    if (
      originalSandboxSettingToRestore !== undefined &&
      workspaceSettings.sandbox !== originalSandboxSettingToRestore
    ) {
      workspaceSettings.sandbox = originalSandboxSettingToRestore;
      settingsModified = true;
      console.log('✅ Restored original sandbox setting.');
    }
  }

  if (settingsModified) {
    writeJsonFile(WORKSPACE_SETTINGS_FILE, workspaceSettings);
    console.log('✅ Workspace settings updated.');
  } else {
    console.log(
      enable
        ? '✅ Workspace settings are already configured for telemetry.'
        : '✅ Workspace settings already reflect telemetry disabled.',
    );
  }
  return currentSandboxSetting;
}

export function registerCleanup(
  getProcesses,
  getLogFileDescriptors,
  originalSandboxSetting,
) {
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    console.log('\n👋 Shutting down...');

    manageTelemetrySettings(false, null, originalSandboxSetting);

    const processes = getProcesses ? getProcesses() : [];
    processes.forEach((proc) => {
      if (proc && proc.pid) {
        const name = path.basename(proc.spawnfile);
        try {
          console.log(`🛑 Stopping ${name} (PID: ${proc.pid})...`);
          process.kill(proc.pid, 'SIGTERM');
          console.log(`✅ ${name} stopped.`);
        } catch (e) {
          if (e.code !== 'ESRCH') {
            console.error(`Error stopping ${name}: ${e.message}`);
          }
        }
      }
    });

    const logFileDescriptors = getLogFileDescriptors
      ? getLogFileDescriptors()
      : [];
    logFileDescriptors.forEach((fd) => {
      if (fd) {
        try {
          fs.closeSync(fd);
        } catch (_) {
          /* no-op */
        }
      }
    });
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    cleanup();
    process.exit(1);
  });
}
