/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type SandboxManager,
  type SandboxRequest,
  type SandboxedCommand,
} from './sandboxManager.js';
import {
  sanitizeEnvironment,
  type EnvironmentSanitizationConfig,
} from './environmentSanitization.js';
import {
  buildBaseBwrapArgs,
  bindExistingPaths,
  bindNodeBinary,
  BWRAP_OPTIONAL_LIB_PATHS,
  BWRAP_ESSENTIAL_ETC_FILES,
} from './bwrapUtils.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * A SandboxManager implementation that uses bubblewrap (bwrap) to provide
 * nested tool-level isolation on Linux.
 *
 * When the CLI is already running inside a bwrap outer sandbox, this manager
 * wraps individual tool commands in a nested bwrap to enforce per-tool
 * isolation (e.g., disabling network access for tools).
 */
export class BwrapSandboxManager implements SandboxManager {
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

    if (os.platform() !== 'linux') {
      return {
        program: req.command,
        args: req.args,
        env: sanitizedEnv,
      };
    }

    const homeDir = os.homedir();
    const workdir = path.resolve(req.cwd);

    const bwrapArgs = buildBaseBwrapArgs('gemini-tool-sandbox');
    // Tools should not have network access — the CLI process handles API calls
    bwrapArgs.push('--unshare-net');

    bindExistingPaths(bwrapArgs, [
      ...BWRAP_OPTIONAL_LIB_PATHS,
      '/etc/ssl',
      '/etc/pki',
    ]);
    bindExistingPaths(bwrapArgs, BWRAP_ESSENTIAL_ETC_FILES);
    bindNodeBinary(bwrapArgs, homeDir);

    // Mount workspace and Gemini settings
    const GEMINI_DIR = '.gemini';
    bwrapArgs.push('--bind', workdir, workdir);
    const geminiSettingsDir = path.join(homeDir, GEMINI_DIR);
    if (fs.existsSync(geminiSettingsDir)) {
      // Gemini settings are read-only for tools to prevent persistent poisoning
      bwrapArgs.push('--ro-bind', geminiSettingsDir, geminiSettingsDir);
    }

    // Private, isolated system paths to block Unix socket escapes
    bwrapArgs.push('--tmpfs', '/tmp');
    bwrapArgs.push('--tmpfs', '/run/user');

    const finalArgs = [...bwrapArgs, '--', req.command, ...req.args];

    // Ensure a safe, empty HOME directory for tools
    const env = { ...sanitizedEnv, HOME: '/tmp' };

    return {
      program: 'bwrap',
      args: finalArgs,
      env,
      cwd: workdir,
    };
  }
}
