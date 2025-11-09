/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getReleaseChannel } from '../../utils/channel.js';
import type { ClientMetadata, ClientMetadataPlatform } from '../types.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache all client metadata.
let clientMetadataPromise: Promise<ClientMetadata> | undefined;

function getPlatform(): ClientMetadataPlatform {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin' && arch === 'x64') {
    return 'DARWIN_AMD64';
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return 'DARWIN_ARM64';
  }
  if (platform === 'linux' && arch === 'x64') {
    return 'LINUX_AMD64';
  }
  if (platform === 'linux' && arch === 'arm64') {
    return 'LINUX_ARM64';
  }
  if (platform === 'win32' && arch === 'x64') {
    return 'WINDOWS_AMD64';
  }
  return 'PLATFORM_UNSPECIFIED';
}

/**
 * Returns the client metadata.
 *
 * The client metadata is cached so that it is only computed once per session.
 */
export async function getClientMetadata(): Promise<ClientMetadata> {
  if (!clientMetadataPromise) {
    clientMetadataPromise = (async () => ({
      ideName: 'GEMINI_CLI',
      ideVersion: process.env['CLI_VERSION'] || process.version,
      platform: getPlatform(),
      updateChannel: await getReleaseChannel(__dirname),
    }))();
  }
  return await clientMetadataPromise;
}
