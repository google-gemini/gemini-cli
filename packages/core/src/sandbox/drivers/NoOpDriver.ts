/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { debugLogger } from '../../utils/debugLogger.js';
import { type SandboxConfig } from '../../config/config.js';
import { type SandboxDriver, type SandboxMetadata } from '../types.js';

/**
 * A "No-Op" driver for unsandboxed environments.
 * Provides consistent logging and warnings when no real sandbox is selected.
 */
export class NoOpDriver implements SandboxDriver {
  readonly name = 'none';

  async isSupported(): Promise<boolean> {
    return true; // Always supported
  }

  async prepare(): Promise<void> {
    debugLogger.warn('No sandbox driver selected. Running in unsandboxed mode.');
  }

  async spawn(
    _config: SandboxConfig,
    nodeArgs: string[],
    cliArgs: string[],
  ): Promise<ChildProcess> {
    const script = process.argv[1];
    const scriptArgs = cliArgs.slice(2);
    const fullNodeArgs = [...process.execArgv, ...nodeArgs, script, ...scriptArgs];

    process.stdin.pause();
    const child = spawn(process.execPath, fullNodeArgs, {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, SANDBOX: 'none', GEMINI_CLI_NO_RELAUNCH: 'true' },
    });

    return child;
  }

  async getMetadata(): Promise<SandboxMetadata> {
    return {
      driverName: this.name,
      isSupported: true,
      platform: process.platform,
    };
  }
}
