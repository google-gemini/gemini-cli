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
  type SandboxPermissions,
  type ParsedSandboxDenial,
  resolveSandboxPaths,
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
import { isSubpath, resolveToRealPath } from '../../utils/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// S-1-16-4096 is the SID for "Low Mandatory Level" (Low Integrity)

/**
 * A SandboxManager implementation for Windows that uses Restricted Tokens,
 * Job Objects, and Low Integrity levels for process isolation.
 * Uses a native C# helper to bypass PowerShell restrictions.
 */
export class WindowsSandboxManager implements SandboxManager {
  static readonly HELPER_EXE = 'GeminiSandbox.exe';
  static readonly HELPER_SOURCE = 'GeminiSandbox.cs';

  private helperPath: string;
  private initialized = false;

  /**
   * Optimistically caches modified ACLs to prevent redundant Win32 API calls.
   * Skips even if a previous application failed.
   */
  private readonly allowedCache = new Set<string>();
  private readonly deniedCache = new Set<string>();

  constructor(private readonly options: GlobalSandboxOptions) {
    this.helperPath = path.resolve(__dirname, WindowsSandboxManager.HELPER_EXE);
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

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!fs.existsSync(this.helperPath)) {
        debugLogger.log(
          'WindowsSandboxManager: Helper not found at',
          this.helperPath,
        );
        const sourcePath = path.resolve(
          __dirname,
          WindowsSandboxManager.HELPER_SOURCE,
        );
        if (fs.existsSync(sourcePath)) {
          debugLogger.log(
            'WindowsSandboxManager: Compiling helper from source...',
          );
          try {
            // Try to compile using csc.exe (C# compiler, usually in Windows\Microsoft.NET\Framework64\v4.0.30319)
            const systemRoot = process.env['SystemRoot'] || 'C:\\Windows';
            const cscPath = path.join(
              systemRoot,
              'Microsoft.NET',
              'Framework64',
              'v4.0.30319',
              'csc.exe',
            );
            if (fs.existsSync(cscPath)) {
              await spawnAsync(cscPath, [
                '/target:exe',
                `/out:${this.helperPath}`,
                sourcePath,
              ]);
              debugLogger.log(
                `WindowsSandboxManager: Compiled helper to ${this.helperPath}`,
              );
            } else {
              debugLogger.log(
                'WindowsSandboxManager: csc.exe not found. Cannot compile helper.',
              );
            }
          } catch (e) {
            debugLogger.log(
              'WindowsSandboxManager: Failed to compile helper:',
              e,
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

    const command = req.command;
    const args = req.args;

    // Native commands __read and __write are passed directly to GeminiSandbox.exe

    const isYolo = this.options.modeConfig?.yolo ?? false;

    // Fetch persistent approvals for this command
    const commandName = await getCommandName(command, args);
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
        isYolo ||
        persistentPermissions?.network ||
        req.policy?.additionalPermissions?.network ||
        false,
    };

    if (req.command === '__read' && req.args[0]) {
      mergedAdditional.fileSystem!.read!.push(req.args[0]);
    } else if (req.command === '__write' && req.args[0]) {
      mergedAdditional.fileSystem!.write!.push(req.args[0]);
    }

    const defaultNetwork =
      this.options.modeConfig?.network ?? req.policy?.networkAccess ?? false;
    const networkAccess = defaultNetwork || mergedAdditional.network;

    const { allowed: allowedPaths, forbidden: forbiddenPaths } =
      await resolveSandboxPaths(this.options, req);

    // Track all roots where Low Integrity write access has been granted.
    // New files created within these roots will inherit the Low label.
    const writableRoots: string[] = [];

    // 1. Determine filesystem permissions to grant
    const pathsToGrant = new Set<string>();

    const isApproved = allowOverrides
      ? await isStrictlyApproved(
          command,
          args,
          this.options.modeConfig?.approvedTools,
        )
      : false;

    if (!isReadonlyMode || isApproved) {
      pathsToGrant.add(this.options.workspace);
      writableRoots.push(this.options.workspace);
    }

    allowedPaths.forEach((p) => {
      const resolved = resolveToRealPath(p);
      pathsToGrant.add(resolved);
      writableRoots.push(resolved);
    });

    const extraWritePaths =
      sanitizePaths(mergedAdditional.fileSystem?.write) || [];
    extraWritePaths.forEach((p) => {
      const resolved = resolveToRealPath(p);
      if (fs.existsSync(resolved)) {
        pathsToGrant.add(resolved);
        writableRoots.push(resolved);
      } else {
        // If the file doesn't exist, it's only allowed if it resides within a granted root.
        const isInherited = writableRoots.some((root) =>
          isSubpath(root, resolved),
        );

        if (!isInherited) {
          throw new Error(
            `Sandbox request rejected: Additional write path does not exist and its parent directory is not allowed: ${resolved}. ` +
              'On Windows, granular sandbox access can only be granted to existing paths to avoid broad parent directory permissions.',
          );
        }
      }
    });

    const includeDirs = sanitizePaths(this.options.includeDirectories);
    includeDirs.forEach((p) => {
      const resolved = resolveToRealPath(p);
      pathsToGrant.add(resolved);
      writableRoots.push(resolved);
    });

    // 2. Identify forbidden paths and secrets to deny
    const pathsToDeny = new Set<string>();
    forbiddenPaths.forEach((p) => pathsToDeny.add(resolveToRealPath(p)));

    // Scoped scan for secrets to explicitly block for Low Integrity processes
    const searchDirs = new Set([
      this.options.workspace,
      ...allowedPaths,
      ...includeDirs,
    ]);
    await Promise.all(
      Array.from(searchDirs).map(async (dir) => {
        try {
          // We use maxDepth 3 to catch common nested secrets while keeping performance high.
          const secrets = await findSecretFiles(dir, 3);
          secrets.forEach((s) => pathsToDeny.add(resolveToRealPath(s)));
        } catch (e) {
          debugLogger.log(
            `WindowsSandboxManager: Secret scan failed for ${dir}`,
            e,
          );
        }
      }),
    );

    // 3. Reconcile Grant and Deny paths
    for (const p of pathsToGrant) {
      if (pathsToDeny.has(p)) {
        pathsToGrant.delete(p);
        continue;
      }

      try {
        await fs.promises.access(p, fs.constants.F_OK);
      } catch {
        // If it doesn't exist, we can't grant access on Windows.
        pathsToGrant.delete(p);
      }
    }

    // 4. Generate setup manifest operations (L = Grant, D = Deny)
    const opResults = await Promise.all([
      ...Array.from(pathsToGrant).map((p) => this.getLowIntegrityOp(p, 'L')),
      ...Array.from(pathsToDeny).map((p) => this.getLowIntegrityOp(p, 'D')),
    ]);

    const pendingAcls = opResults.filter(
      (op): op is string => op !== undefined,
    );

    // 5. Ensure governance files are write-protected
    for (const file of GOVERNANCE_FILES) {
      this.touch(
        path.join(this.options.workspace, file.path),
        file.isDirectory,
      );
    }

    // 6. Create setup manifest if needed
    let manifestPath: string | undefined;
    if (pendingAcls.length > 0) {
      manifestPath = path.join(
        os.tmpdir(),
        `gemini-cli-sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
      );
      fs.writeFileSync(manifestPath, pendingAcls.join('\n'), { mode: 0o600 });
    }

    const finalEnv = { ...sanitizedEnv };

    return {
      program: this.helperPath,
      args: [
        networkAccess ? '1' : '0',
        req.cwd,
        ...(manifestPath ? ['--setup-manifest', manifestPath] : []),
        command,
        ...args,
      ],
      env: finalEnv,
      cwd: req.cwd,
      cleanup: () => {
        if (manifestPath) {
          try {
            fs.unlinkSync(manifestPath);
          } catch {
            // Ignore cleanup errors
          }
        }
      },
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

    const resolved = resolveToRealPath(targetPath);
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
      isSubpath(systemRoot, resolvedPath) ||
      isSubpath(programFiles, resolvedPath) ||
      isSubpath(programFilesX86, resolvedPath)
    );
  }

  /**
   * Touches a file or directory to ensure it exists.
   */
  private touch(filePath: string, isDirectory: boolean): void {
    try {
      if (isDirectory) {
        if (!fs.existsSync(filePath)) {
          fs.mkdirSync(filePath, { recursive: true });
        }
      } else {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, '');
        }
      }
    } catch (e) {
      debugLogger.log(`WindowsSandboxManager: Failed to touch ${filePath}:`, e);
    }
  }

  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return parseWindowsSandboxDenials(result);
  }

  getWorkspace(): string {
    return this.options.workspace;
  }

  getOptions(): GlobalSandboxOptions | undefined {
    return this.options;
  }
}
