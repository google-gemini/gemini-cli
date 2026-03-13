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
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { quote } from 'shell-quote';

/**
 * A SandboxManager implementation that uses bubblewrap (bwrap) to provide
 * nested tool-level isolation on Linux.
 */
export class BwrapSandboxManager implements SandboxManager {
  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    const sanitizationConfig: EnvironmentSanitizationConfig = {
      allowedEnvironmentVariables:
        req.config?.sanitizationConfig?.allowedEnvironmentVariables ?? [],
      blockedEnvironmentVariables:
        req.config?.sanitizationConfig?.blockedEnvironmentVariables ?? [],
      enableEnvironmentVariableRedaction: true,
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
    const workdir = path.resolve(process.cwd());

    // We use a nested bwrap to provide tool-level isolation (like disabling network)
    // while the CLI itself is already sandboxed.
    const bwrapArgs: string[] = [
      '--new-session',
      '--die-with-parent',
      '--unshare-pid',
      '--unshare-user',
      '--unshare-ipc',
      '--unshare-uts',
      '--unshare-cgroup',
      '--hostname',
      'gemini-tool-sandbox',
      '--proc',
      '/proc',
      '--dev',
      '/dev',
      '--dev-bind',
      '/dev/pts',
      '/dev/pts',
      // Strict allow-list for nested sandbox
      '--ro-bind',
      '/usr',
      '/usr',
      '--ro-bind',
      '/bin',
      '/bin',
      '--ro-bind',
      '/sbin',
      '/sbin',
    ];

    // Optional system paths
    const optionalPaths = ['/lib', '/lib64', '/etc/alternatives'];
    for (const p of optionalPaths) {
      if (fs.existsSync(p)) {
        bwrapArgs.push('--ro-bind', p, p);
      }
    }

    // Essential /etc files for tool compatibility
    const etcFiles = [
      '/etc/passwd',
      '/etc/group',
      '/etc/hosts',
      '/etc/nsswitch.conf',
    ];
    for (const p of etcFiles) {
      if (fs.existsSync(p)) {
        bwrapArgs.push('--ro-bind', p, p);
      }
    }

    // Force network off for tools if requested
    if (req.forceNetworkOff) {
      bwrapArgs.push('--unshare-net');
    } else {
      // If network is NOT forced off, we still need resolv.conf for DNS
      const resolvPaths = [
        '/etc/resolv.conf',
        '/run/systemd/resolve/stub-resolv.conf',
        '/run/systemd/resolve/resolv.conf',
      ];
      for (const p of resolvPaths) {
        if (fs.existsSync(p)) {
          bwrapArgs.push('--ro-bind', p, p);
        }
      }
    }

    // Allow current node binary (important if tool is a node script)
    const nodePath = process.execPath;
    if (nodePath.startsWith(homeDir)) {
      bwrapArgs.push('--ro-bind', nodePath, nodePath);
      const nodeDir = path.dirname(nodePath);
      bwrapArgs.push('--ro-bind', nodeDir, nodeDir);
    }

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

    // Execute via shell
    const shell = process.env['SHELL'] || '/bin/bash';
    // If we have args, we quote everything. If not, we assume command is a shell string.
    const innerCmd =
      req.args.length > 0
        ? [req.command, ...req.args].map((arg) => quote([arg])).join(' ')
        : req.command;

    const finalArgs = [...bwrapArgs, '--', shell, '-c', innerCmd];

    // Ensure a safe, empty HOME directory for tools
    const env = { ...sanitizedEnv, HOME: '/tmp' };

    return {
      program: 'bwrap',
      args: finalArgs,
      env,
    };
  }
}
