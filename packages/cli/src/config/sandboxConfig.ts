/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getPackageJson,
  type SandboxConfig,
  SandboxManager,
} from '@google/gemini-cli-core';
import type { Settings } from './settings.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SandboxCliArgs {
  sandbox?: boolean | string | null;
}

async function getSandboxCommand(
  sandbox?: boolean | string | null,
): Promise<SandboxConfig['command'] | ''> {
  if (process.env['SANDBOX']) {
    return '';
  }

  const environmentConfiguredSandbox =
    process.env['GEMINI_SANDBOX']?.toLowerCase().trim() ?? '';
  sandbox =
    environmentConfiguredSandbox?.length > 0
      ? environmentConfiguredSandbox
      : sandbox;
  if (sandbox === '1' || sandbox === 'true') sandbox = true;
  else if (sandbox === '0' || sandbox === 'false' || !sandbox) sandbox = false;

  if (sandbox === false) {
    return '';
  }

  const preferredName = typeof sandbox === 'string' ? sandbox : undefined;
  const sandboxManager = SandboxManager.getInstance();
  const driver = await sandboxManager.discoverBestDriver(preferredName);

  if (driver && driver.name !== 'none') {
    return driver.name as SandboxConfig['command'];
  }

  return '';
}

export async function loadSandboxConfig(
  settings: Settings,
  argv: SandboxCliArgs,
): Promise<SandboxConfig | undefined> {
  const sandboxOption = argv.sandbox ?? settings.tools?.sandbox;
  const command = await getSandboxCommand(sandboxOption);

  const packageJson = await getPackageJson(__dirname);
  const image =
    process.env['GEMINI_SANDBOX_IMAGE'] ??
    process.env['GEMINI_SANDBOX_IMAGE_DEFAULT'] ??
    packageJson?.config?.sandboxImageUri;

  return command && image ? { command, image } : undefined;
}
