/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { spawn } from 'node:child_process';
import extractZip from 'extract-zip';
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';
import { getErrorMessage, isNodeError } from '../utils/errors.js';

const RIPGREP_REPOSITORY = 'microsoft/ripgrep-prebuilt';
const RIPGREP_VERSION = process.env['RIPGREP_VERSION'] || 'v13.0.0-10';

function getRipgrepTarget(): string {
  const arch = process.env['npm_config_arch'] || os.arch();
  const platform = process.env['platform'] || os.platform();
  switch (platform) {
    case 'darwin':
      switch (arch) {
        case 'arm64':
          return 'aarch64-apple-darwin.tar.gz';
        default:
          return 'x86_64-apple-darwin.tar.gz';
      }
    case 'win32':
      switch (arch) {
        case 'x64':
          return 'x86_64-pc-windows-msvc.zip';
        case 'arm':
          return 'aarch64-pc-windows-msvc.zip';
        default:
          return 'i686-pc-windows-msvc.zip';
      }
    case 'linux':
      switch (arch) {
        case 'x64':
          return 'x86_64-unknown-linux-musl.tar.gz';
        case 'arm':
        case 'armv7l':
          return 'arm-unknown-linux-gnueabihf.tar.gz';
        case 'arm64':
          return 'aarch64-unknown-linux-gnu.tar.gz';
        case 'ppc64':
          return 'powerpc64le-unknown-linux-gnu.tar.gz';
        case 's390x':
          return 's390x-unknown-linux-gnu.tar.gz';
        default:
          return 'i686-unknown-linux-musl.tar.gz';
      }
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

function getXdgCacheDir(): string {
  const homeDir = os.homedir();
  return process.env['XDG_CACHE_HOME'] || path.join(homeDir, '.cache');
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function moveFile(sourcePath: string, destinationPath: string) {
  try {
    await fsPromises.rename(sourcePath, destinationPath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'EXDEV') {
      await fsPromises.copyFile(sourcePath, destinationPath);
      await fsPromises.rm(sourcePath, { force: true });
      return;
    }
    throw error;
  }
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed: ${command} ${args.join(' ')}`));
    });
  });
}

export function createRipgrepDispatcher(): EnvHttpProxyAgent {
  return new EnvHttpProxyAgent();
}

export async function downloadFile(
  url: string,
  outFile: string,
): Promise<void> {
  let tmpDir: string | undefined;
  try {
    tmpDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'download-ripgrep'),
    );
    const tmpFile = path.join(tmpDir, 'tmp-file');
    const response = await undiciFetch(url, {
      dispatcher: createRipgrepDispatcher(),
    });
    if (!response.ok) {
      throw new Error(
        `Unexpected response while downloading ripgrep: ${response.status} ${response.statusText}`,
      );
    }
    if (!response.body) {
      throw new Error('Ripgrep download returned no response body.');
    }
    await pipeline(response.body, fs.createWriteStream(tmpFile));
    await fsPromises.mkdir(path.dirname(outFile), { recursive: true });
    await moveFile(tmpFile, outFile);
  } catch (error) {
    throw new Error(`Failed to download "${url}": ${getErrorMessage(error)}`, {
      cause: error,
    });
  } finally {
    if (tmpDir) {
      await fsPromises.rm(tmpDir, { recursive: true, force: true });
    }
  }
}

async function unzip(inFile: string, outDir: string): Promise<void> {
  try {
    await fsPromises.mkdir(outDir, { recursive: true });
    await extractZip(inFile, { dir: outDir });
  } catch (error) {
    throw new Error(`Failed to unzip "${inFile}": ${getErrorMessage(error)}`, {
      cause: error,
    });
  }
}

async function untarGz(inFile: string, outDir: string): Promise<void> {
  try {
    await fsPromises.mkdir(outDir, { recursive: true });
    await runCommand('tar', ['xvf', inFile, '-C', outDir]);
  } catch (error) {
    throw new Error(
      `Failed to extract "${inFile}": ${getErrorMessage(error)}`,
      {
        cause: error,
      },
    );
  }
}

export async function downloadRipGrep(binPath: string): Promise<void> {
  const target = getRipgrepTarget();
  const url = `https://github.com/${RIPGREP_REPOSITORY}/releases/download/${RIPGREP_VERSION}/ripgrep-${RIPGREP_VERSION}-${target}`;
  const downloadPath = path.join(
    getXdgCacheDir(),
    'vscode-ripgrep',
    `ripgrep-${RIPGREP_VERSION}-${target}`,
  );
  if (!(await pathExists(downloadPath))) {
    await downloadFile(url, downloadPath);
  }
  if (downloadPath.endsWith('.tar.gz')) {
    await untarGz(downloadPath, binPath);
    return;
  }
  if (downloadPath.endsWith('.zip')) {
    await unzip(downloadPath, binPath);
    return;
  }
  throw new Error(`Invalid ripgrep download path: ${downloadPath}`);
}
