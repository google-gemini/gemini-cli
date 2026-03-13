/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type SandboxManager,
  type SandboxRequest,
  type SandboxedCommand,
} from './sandboxManager.js';
import {
  sanitizeEnvironment,
  type EnvironmentSanitizationConfig,
} from './environmentSanitization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * A SandboxManager implementation for Windows that uses Restricted Tokens,
 * Job Objects, and Low Integrity levels for process isolation.
 * Uses a native C# helper to bypass PowerShell restrictions.
 */
export class WindowsSandboxManager implements SandboxManager {
  private readonly helperPath: string;
  private initialized = false;

  constructor() {
    this.helperPath = path.resolve(__dirname, 'scripts', 'GeminiSandbox.exe');
  }

  private ensureInitialized(): void {
    if (this.initialized) return;

    if (!fs.existsSync(this.helperPath)) {
      // If the exe doesn't exist, we try to compile it from the .cs file
      const sourcePath = this.helperPath.replace(/\.exe$/, '.cs');
      if (fs.existsSync(sourcePath)) {
        const systemRoot = process.env['SystemRoot'] || 'C:\\Windows';
        const cscPaths = [
          'csc.exe', // Try in PATH first
          path.join(
            systemRoot,
            'Microsoft.NET',
            'Framework64',
            'v4.0.30319',
            'csc.exe',
          ),
          path.join(
            systemRoot,
            'Microsoft.NET',
            'Framework',
            'v4.0.30319',
            'csc.exe',
          ),
        ];

        let compiled = false;
        for (const csc of cscPaths) {
          const result = spawnSync(csc, ['/out:' + this.helperPath, sourcePath], {
            stdio: 'ignore',
          });
          if (result.status === 0) {
            compiled = true;
            break;
          }
        }
      }
    }

    this.initialized = true;
  }

  /**
   * Prepares a command for sandboxed execution on Windows.
   */
  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    this.ensureInitialized();

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

    // 1. Handle filesystem permissions for Low Integrity
    // Grant "Low Mandatory Level" write access to the CWD.
    this.grantLowIntegrityAccess(req.cwd);

    // Grant "Low Mandatory Level" read access to allowedPaths.
    if (req.config?.allowedPaths) {
      for (const allowedPath of req.config.allowedPaths) {
        this.grantLowIntegrityAccess(allowedPath);
      }
    }

    // 2. Construct the helper command
    // GeminiSandbox.exe <network:0|1> <cwd> <command> [args...]
    const program = this.helperPath;

    // If the command starts with __, it's an internal command for the sandbox helper itself.
    const args = [
      req.config?.networkAccess ? '1' : '0',
      req.cwd,
      req.command,
      ...req.args,
    ];

    return {
      program,
      args,
      env: sanitizedEnv,
    };
  }

  /**
   * Grants "Low Mandatory Level" access to a path using icacls.
   */
  private grantLowIntegrityAccess(targetPath: string): void {
    try {
      spawnSync('icacls', [targetPath, '/setintegritylevel', 'Low'], {
        stdio: 'ignore',
      });
    } catch (e) {
      // Best effort
    }
  }
}
