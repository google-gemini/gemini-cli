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
  findSecretFiles,
  type GlobalSandboxOptions,
  sanitizePaths,
  tryRealpath,
  type SandboxPermissions,
  type ParsedSandboxDenial,
} from '../../services/sandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
} from '../../services/environmentSanitization.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { spawnAsync, getCommandName } from '../../utils/shell-utils.js';
import { isNodeError } from '../../utils/errors.js';
import {
  isKnownSafeCommand,
  isDangerousCommand,
  isStrictlyApproved,
} from './commandSafety.js';
import { verifySandboxOverrides } from '../utils/commandUtils.js';
import { parseWindowsSandboxDenials } from './windowsSandboxDenialUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let registeredCleanup = false;
const filesToCleanup: string[] = [];

/**
 * A SandboxManager implementation for Windows that uses Restricted Tokens,
 * Job Objects, and Low Integrity levels for process isolation.
 * Uses a native C# helper to bypass PowerShell restrictions.
 */
export class WindowsSandboxManager implements SandboxManager {
  private readonly helperPath: string;
  private initialized = false;
  /**
   * Caches paths with modified ACLs to prevent redundant, costly Win32 API calls
   * across multiple command executions within the same session.
   */
  private readonly allowedCache = new Set<string>();
  private readonly deniedCache = new Set<string>();

  constructor(private readonly options: GlobalSandboxOptions) {
    this.helperPath = path.resolve(__dirname, 'GeminiSandbox.exe');
  }

  isKnownSafeCommand(args: string[]): boolean {
    const toolName = args[0]?.toLowerCase();
    const approvedTools = this.options.modeConfig?.approvedTools ?? [];
    if (toolName && approvedTools.some((t) => t.toLowerCase() === toolName)) {
      return true;
    }
    return isKnownSafeCommand(args);
  }

  isDangerousCommand(args: string[]): boolean {
    return isDangerousCommand(args);
  }

  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return parseWindowsSandboxDenials(result);
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

    const isReadonlyMode = this.options.modeConfig?.readonly ?? true;
    const allowOverrides = this.options.modeConfig?.allowOverrides ?? true;

    // Reject override attempts in plan mode
    verifySandboxOverrides(allowOverrides, req.policy);

    // Fetch persistent approvals for this command
    const commandName = await getCommandName(req.command, req.args);
    const persistentPermissions = allowOverrides
      ? this.options.policyManager?.getCommandPermissions(commandName)
      : undefined;

    // Merge all permissions
    const mergedAdditional: SandboxPermissions = {
      fileSystem: {
        read: [
          ...(persistentPermissions?.fileSystem?.read ?? []),
          ...(req.policy?.additionalPermissions?.fileSystem?.read ?? []),
        ],
        write: [
          ...(persistentPermissions?.fileSystem?.write ?? []),
          ...(req.policy?.additionalPermissions?.fileSystem?.write ?? []),
        ],
      },
      network:
        persistentPermissions?.network ||
        req.policy?.additionalPermissions?.network ||
        false,
    };

    // 1. Determine filesystem permissions to grant
    const pathsToGrant = new Set<string>();

    // Grant write access if not readonly or tool is strictly approved
    const isApproved = allowOverrides
      ? await isStrictlyApproved(
          req.command,
          req.args,
          this.options.modeConfig?.approvedTools,
        )
      : false;

    if (!isReadonlyMode || isApproved) {
      pathsToGrant.add(this.options.workspace);
    }

    const allowedPaths = sanitizePaths(req.policy?.allowedPaths) || [];
    allowedPaths.forEach((p) => pathsToGrant.add(p));

    const extraWritePaths =
      sanitizePaths(mergedAdditional.fileSystem?.write) || [];
    extraWritePaths.forEach((p) => pathsToGrant.add(p));

    // 2. Identify forbidden paths and secrets to deny
    const pathsToDeny = new Set<string>();
    const forbiddenPaths = sanitizePaths(this.options.forbiddenPaths) || [];
    forbiddenPaths.forEach((p) => pathsToDeny.add(p));

    const searchDirs = new Set([this.options.workspace, ...allowedPaths]);
    for (const dir of searchDirs) {
      try {
        const secrets = await findSecretFiles(dir, 3);
        secrets.forEach((s) => pathsToDeny.add(s));
      } catch (e) {
        debugLogger.log(
          `WindowsSandboxManager: Secret scan failed for ${dir}`,
          e,
        );
      }
    }

    // 3. Generate setup manifest operations (L = Grant, D = Deny)
    const pendingAcls: string[] = [];
    for (const p of pathsToGrant) {
      const op = await this.getLowIntegrityOp(p, 'L');
      if (op) pendingAcls.push(op);
    }
    for (const p of pathsToDeny) {
      const op = await this.getLowIntegrityOp(p, 'D');
      if (op) pendingAcls.push(op);
    }

    // 4. Ensure governance files are write-protected
    for (const file of GOVERNANCE_FILES) {
      this.touch(
        path.join(this.options.workspace, file.path),
        file.isDirectory,
      );
    }

    // 5. Create setup manifest if needed
    let manifestPath: string | undefined;
    if (pendingAcls.length > 0) {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'gemini-cli-sandbox-'),
      );
      manifestPath = path.join(tempDir, 'acls.txt');
      fs.writeFileSync(manifestPath, pendingAcls.join('\n'));
      filesToCleanup.push(tempDir);

      if (!registeredCleanup) {
        process.on('exit', () => {
          filesToCleanup.forEach((f) => {
            try {
              fs.rmSync(f, { recursive: true, force: true });
            } catch {
              /* ignore */
            }
          });
        });
        registeredCleanup = true;
      }
    }

    // 6. Final command construction
    const defaultNetwork =
      this.options.modeConfig?.network ?? req.policy?.networkAccess ?? false;
    const networkAccess = defaultNetwork || mergedAdditional.network;

    return {
      program: this.helperPath,
      args: [
        networkAccess ? '1' : '0',
        req.cwd,
        ...(manifestPath ? ['--setup-manifest', manifestPath] : []),
        req.command,
        ...req.args,
      ],
      env: sanitizedEnv,
      cwd: req.cwd,
    };
  }

  /**
   * Resolves a path and generates a Grant (L) or Deny (D) operation for the setup manifest.
   * Checks for platform, caches, system directories, and existence (for Deny).
   */
  private async getLowIntegrityOp(
    targetPath: string,
    mode: 'L' | 'D',
  ): Promise<string | undefined> {
    if (os.platform() !== 'win32') return undefined;

    const resolved = await tryRealpath(targetPath);
    const cache = mode === 'L' ? this.allowedCache : this.deniedCache;
    if (cache.has(resolved)) return undefined;

    // Security: Block UNC paths for Grants (prevents NTLM exfiltration/SSRF)
    if (
      mode === 'L' &&
      resolved.startsWith('\\\\') &&
      !resolved.startsWith('\\\\?\\') &&
      !resolved.startsWith('\\\\.\\')
    ) {
      debugLogger.log(
        'WindowsSandboxManager: Rejecting UNC path for grant:',
        resolved,
      );
      return undefined;
    }

    if (this.isSystemDirectory(resolved)) return undefined;

    // Deny ops fail if the path doesn't exist
    if (mode === 'D') {
      try {
        await fs.promises.stat(resolved);
      } catch (e: unknown) {
        if (isNodeError(e) && e.code === 'ENOENT') return undefined;
        throw e;
      }
    }

    cache.add(resolved);
    return `${mode} ${resolved}`;
  }

  private isSystemDirectory(resolvedPath: string): boolean {
    const systemRoot = process.env['SystemRoot'] || 'C:\\Windows';
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 =
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    return (
      resolvedPath.toLowerCase().startsWith(systemRoot.toLowerCase()) ||
      resolvedPath.toLowerCase().startsWith(programFiles.toLowerCase()) ||
      resolvedPath.toLowerCase().startsWith(programFilesX86.toLowerCase())
    );
  }
}
