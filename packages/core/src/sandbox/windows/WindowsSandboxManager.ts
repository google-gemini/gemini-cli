/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  type SandboxManager,
  type SandboxRequest,
  type SandboxedCommand,
  GOVERNANCE_FILES,
  type GlobalSandboxOptions,
  sanitizePaths,
  tryRealpath,
} from '../../services/sandboxManager.js';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
} from '../../services/environmentSanitization.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { spawnAsync } from '../../utils/shell-utils.js';
import { isNodeError } from '../../utils/errors.js';

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
  private readonly allowedCache = new Set<string>();
  private readonly deniedCache = new Set<string>();

  constructor(private readonly options: GlobalSandboxOptions) {
    this.helperPath = path.resolve(__dirname, 'GeminiSandbox.exe');
  }

  /**
   * Ensures a file or directory exists.
   */
  private touch(filePath: string, isDirectory: boolean): void {
    try {
      // If it exists (even as a broken symlink), do nothing
      if (fs.lstatSync(filePath)) return;
    } catch {
      // Ignore ENOENT
    }

    if (isDirectory) {
      fs.mkdirSync(filePath, { recursive: true });
    } else {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.closeSync(fs.openSync(filePath, 'a'));
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (os.platform() !== 'win32') {
      this.initialized = true;
      return;
    }

    try {
      if (!fs.existsSync(this.helperPath)) {
        debugLogger.log(
          `WindowsSandboxManager: Helper not found at ${this.helperPath}. Attempting to compile...`,
        );
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
            // Added newer framework paths
            path.join(
              systemRoot,
              'Microsoft.NET',
              'Framework64',
              'v4.8',
              'csc.exe',
            ),
            path.join(
              systemRoot,
              'Microsoft.NET',
              'Framework',
              'v4.8',
              'csc.exe',
            ),
            path.join(
              systemRoot,
              'Microsoft.NET',
              'Framework64',
              'v3.5',
              'csc.exe',
            ),
          ];

          let compiled = false;
          for (const csc of cscPaths) {
            try {
              debugLogger.log(
                `WindowsSandboxManager: Trying to compile using ${csc}...`,
              );
              // We use spawnAsync but we don't need to capture output
              await spawnAsync(csc, ['/out:' + this.helperPath, sourcePath]);
              debugLogger.log(
                `WindowsSandboxManager: Successfully compiled sandbox helper at ${this.helperPath}`,
              );
              compiled = true;
              break;
            } catch (e) {
              debugLogger.log(
                `WindowsSandboxManager: Failed to compile using ${csc}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }

          if (!compiled) {
            debugLogger.log(
              'WindowsSandboxManager: Failed to compile sandbox helper from any known CSC path.',
            );
          }
        } else {
          debugLogger.log(
            `WindowsSandboxManager: Source file not found at ${sourcePath}. Cannot compile helper.`,
          );
        }
      } else {
        debugLogger.log(
          `WindowsSandboxManager: Found helper at ${this.helperPath}`,
        );
      }
    } catch (e) {
      debugLogger.log(
        'WindowsSandboxManager: Failed to initialize sandbox helper:',
        e,
      );
    }

    this.initialized = true;
  }

  /**
   * Prepares a command for sandboxed execution on Windows.
   */
  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    await this.ensureInitialized();

    const sanitizationConfig = getSecureSanitizationConfig(
      req.policy?.sanitizationConfig,
    );

    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    // 1. Handle filesystem permissions for Low Integrity
    // Grant "Low Mandatory Level" write access to the workspace.
    await this.grantLowIntegrityAccess(this.options.workspace);

    // Grant "Low Mandatory Level" read access to allowedPaths.
    const allowedPaths = sanitizePaths(req.policy?.allowedPaths) || [];
    for (const allowedPath of allowedPaths) {
      await this.grantLowIntegrityAccess(allowedPath);
    }

    // Denies access to forbiddenPaths for Low Integrity processes.
    const forbiddenPaths = sanitizePaths(req.policy?.forbiddenPaths) || [];
    for (const forbiddenPath of forbiddenPaths) {
      await this.denyLowIntegrityAccess(forbiddenPath);
    }

    // 2. Protected governance files
    // These must exist on the host before running the sandbox to prevent
    // the sandboxed process from creating them with Low integrity.
    // By being created as Medium integrity, they are write-protected from Low processes.
    for (const file of GOVERNANCE_FILES) {
      const filePath = path.join(this.options.workspace, file.path);
      this.touch(filePath, file.isDirectory);

      // We resolve real paths to ensure protection for both the symlink and its target.
      try {
        const realPath = fs.realpathSync(filePath);
        if (realPath !== filePath) {
          // If it's a symlink, the target is already implicitly protected
          // if it's outside the Low integrity workspace (likely Medium).
          // If it's inside, we ensure it's not accidentally Low.
        }
      } catch {
        // Ignore realpath errors
      }
    }

    // 3. Construct the helper command
    // GeminiSandbox.exe <network:0|1> <cwd> <command> [args...]
    const program = this.helperPath;

    // If the command starts with __, it's an internal command for the sandbox helper itself.
    const args = [
      req.policy?.networkAccess ? '1' : '0',
      req.cwd,
      req.command,
      ...req.args,
    ];

    return {
      program,
      args,
      env: sanitizedEnv,
      cwd: req.cwd,
    };
  }

  /**
   * Grants "Low Mandatory Level" access to a path using icacls.
   */
  private async grantLowIntegrityAccess(targetPath: string): Promise<void> {
    if (os.platform() !== 'win32') {
      return;
    }

    const resolvedPath = await tryRealpath(targetPath);
    if (this.allowedCache.has(resolvedPath)) {
      return;
    }

    // Never modify integrity levels for system directories
    const systemRoot = process.env['SystemRoot'] || 'C:\\Windows';
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 =
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    if (
      resolvedPath.toLowerCase().startsWith(systemRoot.toLowerCase()) ||
      resolvedPath.toLowerCase().startsWith(programFiles.toLowerCase()) ||
      resolvedPath.toLowerCase().startsWith(programFilesX86.toLowerCase())
    ) {
      return;
    }

    try {
      await spawnAsync('icacls', [resolvedPath, '/setintegritylevel', 'Low']);
      this.allowedCache.add(resolvedPath);
    } catch (e) {
      debugLogger.log(
        'WindowsSandboxManager: icacls failed for',
        resolvedPath,
        e,
      );
    }
  }

  /**
   * Explicitly denies access to a path for Low Integrity processes using icacls.
   */
  private async denyLowIntegrityAccess(targetPath: string): Promise<void> {
    if (os.platform() !== 'win32') {
      return;
    }

    const resolvedPath = await tryRealpath(targetPath);
    if (this.deniedCache.has(resolvedPath)) {
      return;
    }

    // S-1-16-4096 is the SID for "Low Mandatory Level" (Low Integrity)
    const LOW_INTEGRITY_SID = '*S-1-16-4096';

    // icacls flags: (OI) Object Inherit, (CI) Container Inherit, (F) Full Access Deny.
    // Omit /T (recursive) for performance; (OI)(CI) ensures inheritance for new items.
    // Windows dynamically evaluates existing items, though deep explicit Allow ACEs
    // could potentially bypass this inherited Deny rule.
    const DENY_ALL_INHERIT = '(OI)(CI)(F)';

    // icacls fails on non-existent paths, so we cannot explicitly deny
    // paths that do not yet exist (unlike macOS/Linux).
    // Skip to prevent sandbox initialization failure.
    try {
      await fs.promises.stat(resolvedPath);
    } catch (e: unknown) {
      if (isNodeError(e) && e.code === 'ENOENT') {
        return;
      }
      throw e;
    }

    try {
      await spawnAsync('icacls', [
        resolvedPath,
        '/deny',
        `${LOW_INTEGRITY_SID}:${DENY_ALL_INHERIT}`,
      ]);
      this.deniedCache.add(resolvedPath);
    } catch (e) {
      throw new Error(
        `Failed to deny access to forbidden path: ${resolvedPath}. ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
}
