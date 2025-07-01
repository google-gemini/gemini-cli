/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import https from 'https';
import fs from 'fs';
import os from 'os';
import path from 'path';
import tar from 'tar';
import yauzl from 'yauzl';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERSION = 'v10.2.0';
const BIN_DIR = path.resolve(__dirname, '..', 'bundle');

function getPlatformInfo() {
  const platform = os.platform();
  const arch = os.arch();

  let assetName;
  let extension;
  let binaryNameInArchive = 'fd';

  switch (`${platform}-${arch}`) {
    case 'linux-x64':
      assetName = `fd-${VERSION}-x86_64-unknown-linux-musl`;
      extension = 'tar.gz';
      break;
    case 'darwin-x64':
      assetName = `fd-${VERSION}-x86_64-apple-darwin`;
      extension = 'tar.gz';
      break;
    case 'darwin-arm64':
      assetName = `fd-${VERSION}-aarch64-apple-darwin`;
      extension = 'tar.gz';
      break;
    case 'win32-x64':
      assetName = `fd-${VERSION}-x86_64-pc-windows-msvc`;
      extension = 'zip';
      binaryNameInArchive = 'fd.exe';
      break;
    default:
      throw new Error(`Unsupported platform: ${platform} ${arch}`);
  }

  const archiveName = `${assetName}.${extension}`;
  const url = `https://github.com/sharkdp/fd/releases/download/${VERSION}/${archiveName}`;
  const binaryPathInArchive = `${assetName}/${binaryNameInArchive}`;
  const finalBinaryName = platform === 'win32' ? 'fd.exe' : 'fd';

  return {
    url,
    binaryPathInArchive,
    finalBinaryName,
    isZip: extension === 'zip',
  };
}

async function downloadAndExtract() {
  const platformInfo = getPlatformInfo();

  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const request = https.get(platformInfo.url, (response) => {
    if (response.statusCode === 302) {
      const redirectUrl = response.headers.location;
      if (!redirectUrl) {
        console.error(
          'Failed to download fd binary: Redirect location not found.',
        );
        process.exit(1);
      }
      const redirectRequest = https.get(redirectUrl, (redirectResponse) => {
        handleResponse(redirectResponse, platformInfo);
      });
      redirectRequest.on('error', (err) => {
        console.error('Failed to download fd binary on redirect:', err);
        process.exit(1);
      });
      return;
    }
    handleResponse(response, platformInfo);
  });

  request.on('error', (err) => {
    console.error('Failed to download fd binary:', err);
    process.exit(1);
  });
}

function handleResponse(response, platformInfo) {
  if (platformInfo.isZip) {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
      const buffer = Buffer.concat(chunks);
      yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          console.error('Failed to open zip file:', err);
          process.exit(1);
        }
        zipfile.on('error', (err) => {
          console.error('Error reading zip file:', err);
          process.exit(1);
        });
        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          if (entry.fileName === platformInfo.binaryPathInArchive) {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                console.error('Failed to read zip entry:', err);
                process.exit(1);
              }
              const finalPath = path.join(
                BIN_DIR,
                platformInfo.finalBinaryName,
              );
              const writeStream = fs.createWriteStream(finalPath);
              writeStream.on('error', (err) => {
                console.error('Failed to write binary to file:', err);
                process.exit(1);
              });
              readStream.on('error', (err) => {
                console.error('Error reading from zip entry stream:', err);
                process.exit(1);
              });
              readStream.pipe(writeStream);
              readStream.on('end', () => {
                zipfile.readEntry();
              });
            });
          } else {
            zipfile.readEntry();
          }
        });
      });
    });
  } else {
    const tarStream = response.pipe(
      tar.x({
        strip: 1,
        C: BIN_DIR,
        filter: (p) => p === platformInfo.binaryPathInArchive,
      }),
    );
    tarStream.on('error', (err) => {
      console.error('Failed to extract from tarball:', err);
      process.exit(1);
    });
  }
}

downloadAndExtract();
