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
import { buildSeatbeltArgs } from './seatbeltArgsBuilder.js';

/**
 * Options for configuring the MacOsSandboxManager.
 */
export interface MacOsSandboxOptions {
  /** The primary workspace path to allow access to within the sandbox. */
  workspace: string;
  /** Additional paths to allow access to within the sandbox. */
  allowedPaths?: string[];
  /** Whether network access is allowed. */
  networkAccess?: boolean;
  /** Optional base sanitization config. */
  sanitizationConfig?: EnvironmentSanitizationConfig;
}

/**
 * A SandboxManager implementation for macOS that uses Seatbelt.
 */
export class MacOsSandboxManager implements SandboxManager {
  constructor(private readonly options: MacOsSandboxOptions) {}

  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    const sanitizationConfig = getSecureSanitizationConfig(
      req.config?.sanitizationConfig,
      this.options.sanitizationConfig,
    );

    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    const sandboxArgs = buildSeatbeltArgs({
      workspace: this.options.workspace,
      allowedPaths: this.options.allowedPaths,
      networkAccess: this.options.networkAccess,
    });

    return {
      program: '/usr/bin/sandbox-exec',
      args: [...sandboxArgs, '--', req.command, ...req.args],
      env: sanitizedEnv,
      cwd: req.cwd,
    };
  }
}
