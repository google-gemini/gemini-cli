#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import fs from 'fs';
import net from 'net';
import os from 'os';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const GEMINI_DIR = path.join(ROOT_DIR, '.gemini');
const OTEL_DIR = path.join(GEMINI_DIR, 'otel');
const BIN_DIR = path.join(OTEL_DIR, 'bin');
const OTEL_CONFIG_FILE = path.join(OTEL_DIR, 'collector-local.yaml');
const OTEL_LOG_FILE = path.join(OTEL_DIR, 'collector.log');
const JAEGER_LOG_FILE = path.join(OTEL_DIR, 'jaeger.log');
const JAEGER_PORT = 16686;
const WORKSPACE_SETTINGS_FILE = path.join(GEMINI_DIR, 'settings.json');

// This configuration is for the primary otelcol-contrib instance.
// It receives from the CLI on 4317, exports traces to Jaeger on 14317,
// and sends metrics/logs to the debug log.
const OTEL_CONFIG_CONTENT = `
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "localhost:4317"
processors:
  batch:
    timeout: 1s
exporters:
  otlp:
    endpoint: "localhost:14317"
    tls:
      insecure: true
  debug:
    verbosity: detailed
service:
  telemetry:
    logs:
      level: "debug"
    metrics:
      level: "none"
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
`;

function getJson(url) {
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

function downloadFile(url, dest) {
  try {
    // Use -sS to hide progress but show errors.
    execSync(`curl -fL -sS -o "${dest}" "${url}"`, {
      stdio: 'pipe', // Suppress stdout/stderr from the command
    });
    return dest;
  } catch (e) {
    console.error(`Failed to download file from ${url}`);
    throw e;
  }
}

function findFile(startPath, filter) {
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
      // Test the simple file name, not the full path.
      return filename;
    }
  }
  return null;
}

async function ensureBinary(
  executableName,
  repo,
  assetNameCallback,
  binaryNameInArchive,
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

  if (platform === 'windows' && arch === 'arm64') {
    if (repo === 'jaegertracing/jaeger') {
      console.warn(
        `⚠️ Jaeger does not have a release for Windows on ARM64. Skipping.`,
      );
      return null;
    }
  }

  let release;
  let asset;

  if (repo === 'jaegertracing/jaeger') {
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
      // Jaeger v2 assets are named like 'jaeger-2.7.0-...' but can be in a v1.x release tag.
      // We must search for the asset using simple string matching.
      const expectedSuffix = `-${platform}-${arch}.tar.gz`;
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
  }

  if (!asset) {
    throw new Error(
      `Could not find a suitable asset for ${repo} on platform ${platform}/${arch}.`,
    );
  }

  const downloadUrl = asset.browser_download_url;
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gemini-cli-telemetry-'),
  );
  const archivePath = path.join(tmpDir, asset.name);

  try {
    downloadFile(downloadUrl, archivePath);

    if (ext === 'zip') {
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
        `Could not find binary "${nameToFind}" in extracted archive.`,
      );
    }

    fs.renameSync(foundBinaryPath, executablePath);

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

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readJsonFile(filePath) {
  if (!fileExists(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function waitForPort(port, timeout = 5000) {
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

async function main() {
  // 1. Ensure binaries are available, downloading if necessary.
  // Binaries are stored in the project's .gemini/otel/bin directory
  // to avoid modifying the user's system.
  if (!fileExists(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

  const otelcolPath = await ensureBinary(
    'otelcol-contrib',
    'open-telemetry/opentelemetry-collector-releases',
    (version, platform, arch, ext) =>
      `otelcol-contrib_${version}_${platform}_${arch}.${ext}`,
    'otelcol-contrib',
  ).catch((e) => {
    console.error(`🛑 Error getting otelcol-contrib: ${e.message}`);
    return null;
  });
  if (!otelcolPath) process.exit(1);

  const jaegerPath = await ensureBinary(
    'jaeger',
    'jaegertracing/jaeger',
    (version, platform, arch, ext) =>
      `jaeger-${version}-${platform}-${arch}.${ext}`,
    'jaeger',
  ).catch((e) => {
    console.error(`🛑 Error getting jaeger: ${e.message}`);
    return null;
  });
  if (!jaegerPath) process.exit(1);

  // 2. Kill any existing processes to ensure a clean start.
  console.log('🧹 Cleaning up old processes and logs...');
  try {
    execSync('pkill -f "otelcol-contrib"');
    console.log('✅ Stopped existing otelcol-contrib process.');
  } catch (_e) {} // eslint-disable-line no-empty
  try {
    execSync('pkill -f "jaeger"');
    console.log('✅ Stopped existing jaeger process.');
  } catch (_e) {} // eslint-disable-line no-empty
  try {
    fs.unlinkSync(OTEL_LOG_FILE);
    console.log('✅ Deleted old collector log.');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(e);
  }
  try {
    fs.unlinkSync(JAEGER_LOG_FILE);
    console.log('✅ Deleted old jaeger log.');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(e);
  }

  let jaegerProcess, collectorProcess;
  let jaegerLogFd, collectorLogFd;

  const cleanup = () => {
    console.log('\n👋 Shutting down...');

    // Restore original settings
    const finalSettings = readJsonFile(WORKSPACE_SETTINGS_FILE);
    if (finalSettings.telemetry) {
      delete finalSettings.telemetry.enabled;
      delete finalSettings.telemetry.otlpEndpoint;
      if (Object.keys(finalSettings.telemetry).length === 0) {
        delete finalSettings.telemetry;
      }
    }
    finalSettings.sandbox = originalSandboxSetting;
    writeJsonFile(WORKSPACE_SETTINGS_FILE, finalSettings);
    console.log('✅ Restored original telemetry and sandbox settings.');

    [jaegerProcess, collectorProcess].forEach((proc) => {
      if (proc && proc.pid) {
        const name = path.basename(proc.spawnfile);
        try {
          console.log(`🛑 Stopping ${name} (PID: ${proc.pid})...`);
          // Use SIGTERM for a graceful shutdown
          process.kill(proc.pid, 'SIGTERM');
          console.log(`✅ ${name} stopped.`);
        } catch (e) {
          // It's okay if the process is already gone.
          if (e.code !== 'ESRCH')
            console.error(`Error stopping ${name}: ${e.message}`);
        }
      }
    });
    [jaegerLogFd, collectorLogFd].forEach((fd) => {
      if (fd)
        try {
          fs.closeSync(fd);
        } catch (_) {} // eslint-disable-line no-empty
    });
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
  });

  if (!fileExists(OTEL_DIR)) fs.mkdirSync(OTEL_DIR, { recursive: true });
  fs.writeFileSync(OTEL_CONFIG_FILE, OTEL_CONFIG_CONTENT);
  console.log('📄 Wrote OTEL collector config.');

  const workspaceSettings = readJsonFile(WORKSPACE_SETTINGS_FILE);
  const originalSandboxSetting = workspaceSettings.sandbox;
  let settingsModified = false;

  if (typeof workspaceSettings.telemetry !== 'object') {
    workspaceSettings.telemetry = {};
  }

  if (workspaceSettings.telemetry.enabled !== true) {
    workspaceSettings.telemetry.enabled = true;
    settingsModified = true;
    console.log('⚙️  Enabled telemetry in workspace settings.');
  }

  if (workspaceSettings.sandbox !== false) {
    workspaceSettings.sandbox = false;
    settingsModified = true;
    console.log('✅ Disabled sandbox mode for local telemetry.');
  }

  if (workspaceSettings.telemetry.otlpEndpoint !== 'http://localhost:4317') {
    workspaceSettings.telemetry.otlpEndpoint = 'http://localhost:4317';
    settingsModified = true;
    console.log('🔧 Set telemetry endpoint to http://localhost:4317.');
  }

  if (workspaceSettings.telemetry.target !== 'local') {
    workspaceSettings.telemetry.target = 'local';
    settingsModified = true;
    console.log('🎯 Set telemetry target to local.');
  }

  if (settingsModified) {
    writeJsonFile(WORKSPACE_SETTINGS_FILE, workspaceSettings);
    console.log('✅ Workspace settings updated.');
  } else {
    console.log('✅ Telemetry is already configured correctly.');
  }

  // Start Jaeger
  console.log(`🚀 Starting Jaeger service... Logs: ${JAEGER_LOG_FILE}`);
  jaegerLogFd = fs.openSync(JAEGER_LOG_FILE, 'a');
  // The collector is on 4317, so we move jaeger to 14317.
  jaegerProcess = spawn(
    jaegerPath,
    ['--set=receivers.otlp.protocols.grpc.endpoint=localhost:14317'],
    { stdio: ['ignore', jaegerLogFd, jaegerLogFd] },
  );
  console.log(`⏳ Waiting for Jaeger to start (PID: ${jaegerProcess.pid})...`);

  try {
    await waitForPort(JAEGER_PORT);
    console.log(`✅ Jaeger started successfully.`);
  } catch (_) {
    console.error(`🛑 Error: Jaeger failed to start on port ${JAEGER_PORT}.`);
    if (jaegerProcess && jaegerProcess.pid) {
      process.kill(jaegerProcess.pid, 'SIGKILL');
    }
    if (fileExists(JAEGER_LOG_FILE)) {
      console.error('📄 Jaeger Log Output:');
      console.error(fs.readFileSync(JAEGER_LOG_FILE, 'utf-8'));
    }
    process.exit(1);
  }

  // Start the primary OTEL collector
  console.log(`🚀 Starting OTEL collector... Logs: ${OTEL_LOG_FILE}`);
  collectorLogFd = fs.openSync(OTEL_LOG_FILE, 'a');
  collectorProcess = spawn(otelcolPath, ['--config', OTEL_CONFIG_FILE], {
    stdio: ['ignore', collectorLogFd, collectorLogFd],
  });
  console.log(
    `⏳ Waiting for OTEL collector to start (PID: ${collectorProcess.pid})...`,
  );

  try {
    await waitForPort(4317);
    console.log(`✅ OTEL collector started successfully.`);
  } catch (_) {
    console.error(`🛑 Error: OTEL collector failed to start on port 4317.`);
    if (collectorProcess && collectorProcess.pid) {
      process.kill(collectorProcess.pid, 'SIGKILL');
    }
    if (fileExists(OTEL_LOG_FILE)) {
      console.error('📄 OTEL Collector Log Output:');
      console.error(fs.readFileSync(OTEL_LOG_FILE, 'utf-8'));
    }
    process.exit(1);
  }

  [jaegerProcess, collectorProcess].forEach((proc) => {
    proc.on('error', (err) => {
      console.error(`${proc.spawnargs[0]} process error:`, err);
      process.exit(1);
    });
  });

  console.log(`\n✨ Local telemetry environment is running.`);
  console.log(
    `\n🔎 View traces in the Jaeger UI: http://localhost:${JAEGER_PORT}`,
  );
  console.log(`\nPress Ctrl+C to exit.`);
}

main();
