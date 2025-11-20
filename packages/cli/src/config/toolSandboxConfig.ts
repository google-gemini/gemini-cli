/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FatalSandboxError,
  type ToolSandboxConfig,
} from '@google/gemini-cli-core';
import os from 'node:os';
import type { Settings } from './settings.js';

// This is a stripped-down version of the CliArgs interface from config.ts
// to avoid circular dependencies.
interface ToolSandboxCliArgs {
  toolSandbox?: boolean | string;
}

const VALID_TOOL_SANDBOX_MODES: ReadonlyArray<ToolSandboxConfig['mode']> = [
  'landlock',
];

function normalizeOption(
  option: boolean | string | undefined,
): ToolSandboxConfig['mode'] | '' {
  if (option === undefined) return '';
  if (option === false) return '';

  if (option === true) return 'landlock';

  const normalized = option.toString().toLowerCase().trim();
  if (normalized === 'true' || normalized === '1') return 'landlock';
  if (normalized === 'false' || normalized === '0' || normalized === '') return '';

  return normalized as ToolSandboxConfig['mode'];
}

export function loadToolSandboxConfig(
  settings: Settings,
  argv: ToolSandboxCliArgs,
): ToolSandboxConfig | undefined {
  const option =
    argv.toolSandbox ??
    process.env['GEMINI_TOOL_SANDBOX'] ??
    settings.tools?.toolSandbox;

  const mode = normalizeOption(option);
  if (!mode) {
    return undefined;
  }

  if (!VALID_TOOL_SANDBOX_MODES.includes(mode)) {
    throw new FatalSandboxError(
      `Invalid per-tool sandbox mode '${mode}'. Supported modes: ${VALID_TOOL_SANDBOX_MODES.join(', ')}`,
    );
  }

  if (os.platform() !== 'linux') {
    throw new FatalSandboxError(
      'Per-tool sandboxing is currently supported only on Linux (Landlock).',
    );
  }

  return { mode };
}
