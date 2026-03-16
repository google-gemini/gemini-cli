/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  type SandboxManager,
  type SandboxRequest,
  type SandboxedCommand,
} from '../../services/sandboxManager.js';
import {
  sanitizeEnvironment,
  type EnvironmentSanitizationConfig,
} from '../../services/environmentSanitization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HELPER_PATH = join(__dirname, 'gemini-linux-sandbox-helper');

/**
 * Options for configuring the LinuxSandboxManager.
 */
export interface LinuxSandboxOptions {
  /** The primary workspace path to bind into the sandbox. */
  workspace: string;
  /** Additional paths to bind into the sandbox. */
  allowedPaths?: string[];
}

/**
 * A SandboxManager implementation for Linux that uses Bubblewrap (bwrap).
 */
export class LinuxSandboxManager implements SandboxManager {
  constructor(private readonly options: LinuxSandboxOptions) {}

  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    const sanitizationConfig: EnvironmentSanitizationConfig = {
      allowedEnvironmentVariables:
        req.config?.sanitizationConfig?.allowedEnvironmentVariables ?? [],
      blockedEnvironmentVariables:
        req.config?.sanitizationConfig?.blockedEnvironmentVariables ?? [],
      enableEnvironmentVariableRedaction:
        req.config?.sanitizationConfig?.enableEnvironmentVariableRedaction ??
        true,
    };

    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    const bwrapArgs: string[] = [
      '--unshare-all',
      '--ro-bind',
      '/',
      '/',
      '--dev-bind',
      '/dev',
      '/dev',
      '--bind',
      '/dev/pts',
      '/dev/pts',
      '--bind',
      this.options.workspace,
      this.options.workspace,
    ];

    const allowedPaths = this.options.allowedPaths ?? [];
    for (const path of allowedPaths) {
      if (path !== this.options.workspace) {
        bwrapArgs.push('--bind', path, path);
      }
    }

    bwrapArgs.push('--', HELPER_PATH, req.command, ...req.args);

    return {
      program: 'bwrap',
      args: bwrapArgs,
      env: sanitizedEnv,
    };
  }
}
