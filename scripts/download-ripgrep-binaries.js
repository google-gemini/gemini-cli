/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview This script downloads pre-built ripgrep binaries for all supported
 * architectures and platforms. These binaries are checked into the repository
 * under packages/core/vendor/ripgrep.
 *
 * Maintainers should periodically run this script to upgrade the version
 * of ripgrep being distributed.
 *
 * Usage: node scripts/download-ripgrep-binaries.js
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_VENDOR_DIR = path.join(__dirname, '../packages/core/vendor/ripgrep');
const VERSION = 'v13.0.0-10';

const targets = [
  { platform: 'darwin', arch: 'arm64', file: 'aarch64-apple-darwin.tar.gz' },
  { platform: 'darwin', arch: 'x64', file: 'x86_64-apple-darwin.tar.gz' },
  {
    platform: 'linux',
    arch: 'arm64',
    file: 'aarch64-unknown-linux-gnu.tar.gz',
  },
  { platform: 'linux', arch: 'x64', file: 'x86_64-unknown-linux-musl.tar.gz' },
  { platform: 'win32', arch: 'x64', file: 'x86_64-pc-windows-msvc.zip' },
];

async function downloadBinary() {
  await fsPromises.mkdir(CORE_VENDOR_DIR, { recursive: true });

  for (const target of targets) {
    const url = `https://github.com/microsoft/ripgrep-prebuilt/releases/download/${VERSION}/ripgrep-${VERSION}-${target.file}`;
    const archivePath = path.join(CORE_VENDOR_DIR, target.file);
    const binName = `rg-${target.platform}-${target.arch}${target.platform === 'win32' ? '.exe' : ''}`;
    const finalBinPath = path.join(CORE_VENDOR_DIR, binName);

    if (fs.existsSync(finalBinPath)) {
      console.log(`[Cache] ${binName} already exists.`);
      continue;
    }

    console.log(`[Download] ${url} -> ${archivePath}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error(`Response body is null for ${url}`);
    }

    // Write stream using a Node utility
    const { Readable } = await import('node:stream');
    const fileStream = createWriteStream(archivePath);

    /** @type {import('stream/web').ReadableStream<any>} */
    const webStream = response.body;
    await pipeline(Readable.fromWeb(webStream), fileStream);

    console.log(`[Extract] Extracting ${archivePath}...`);
    // Extract using shell commands for simplicity
    if (target.file.endsWith('.tar.gz')) {
      const { execSync } = await import('node:child_process');
      execSync(`tar -xzf ${archivePath} -C ${CORE_VENDOR_DIR}`);
      // Microsoft's ripgrep release extracts directly to `rg` inside the current directory sometimes
      const sourceBin = path.join(CORE_VENDOR_DIR, 'rg');
      if (fs.existsSync(sourceBin)) {
        await fsPromises.rename(sourceBin, finalBinPath);
      } else {
        // Fallback for sub-directory if it happens
        const extractedDirName = `ripgrep-${VERSION}-${target.file.replace('.tar.gz', '')}`;
        const fallbackSourceBin = path.join(
          CORE_VENDOR_DIR,
          extractedDirName,
          'rg',
        );
        if (fs.existsSync(fallbackSourceBin)) {
          await fsPromises.rename(fallbackSourceBin, finalBinPath);
          await fsPromises.rm(path.join(CORE_VENDOR_DIR, extractedDirName), {
            recursive: true,
            force: true,
          });
        } else {
          throw new Error(
            `Could not find extracted 'rg' binary for ${target.platform} ${target.arch}`,
          );
        }
      }
    } else if (target.file.endsWith('.zip')) {
      const { execSync } = await import('node:child_process');
      execSync(`unzip -o -q ${archivePath} -d ${CORE_VENDOR_DIR}`);
      const sourceBin = path.join(CORE_VENDOR_DIR, 'rg.exe');
      if (fs.existsSync(sourceBin)) {
        await fsPromises.rename(sourceBin, finalBinPath);
      } else {
        const extractedDirName = `ripgrep-${VERSION}-${target.file.replace('.zip', '')}`;
        const fallbackSourceBin = path.join(
          CORE_VENDOR_DIR,
          extractedDirName,
          'rg.exe',
        );
        if (fs.existsSync(fallbackSourceBin)) {
          await fsPromises.rename(fallbackSourceBin, finalBinPath);
          await fsPromises.rm(path.join(CORE_VENDOR_DIR, extractedDirName), {
            recursive: true,
            force: true,
          });
        } else {
          throw new Error(
            `Could not find extracted 'rg.exe' binary for ${target.platform} ${target.arch}`,
          );
        }
      }
    }

    // Clean up archive
    await fsPromises.unlink(archivePath);
    console.log(`[Success] Saved to ${finalBinPath}`);
  }
}

downloadBinary().catch((err) => {
  console.error(err);
  process.exit(1);
});
