/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type SandboxManager,
  type SandboxRequest,
  type SandboxedCommand,
} from '../../services/sandboxManager.js';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
  type EnvironmentSanitizationConfig,
} from '../../services/environmentSanitization.js';

/**
 * Options for configuring the LinuxSandboxManager.
 */
export interface LinuxSandboxOptions {
  /** The primary workspace path to bind into the sandbox. */
  workspace: string;
  /** Additional paths to bind into the sandbox. */
  allowedPaths?: string[];
  /** Optional base sanitization config. */
  sanitizationConfig?: EnvironmentSanitizationConfig;
}

/**
 * A SandboxManager implementation for Linux that uses Bubblewrap (bwrap).
 */
export class LinuxSandboxManager implements SandboxManager {
  constructor(private readonly options: LinuxSandboxOptions) {}

  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    const sanitizationConfig = getSecureSanitizationConfig(
      req.config?.sanitizationConfig,
      this.options.sanitizationConfig,
    );

    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    const bwrapArgs: string[] = [
      '--unshare-all',
      '--new-session', // Isolate session
      '--die-with-parent', // Prevent orphaned runaway processes
      '--ro-bind',
      '/',
      '/',
      '--dev', // Creates a safe, minimal /dev (replaces --dev-bind)
      '/dev',
      '--proc', // Creates a fresh procfs for the unshared PID namespace
      '/proc',
      '--tmpfs', // Provides an isolated, writable /tmp directory
      '/tmp',
      // Note: --dev /dev sets up /dev/pts automatically
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

    bwrapArgs.push('--', req.command, ...req.args);

    return {
      program: 'bwrap',
      args: bwrapArgs,
      env: sanitizedEnv,
    };
  }
}
