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
const LOW_INTEGRITY_SID = '*S-1-16-4096';

/**
 * A SandboxManager implementation for Windows that uses Restricted Tokens,
 * Job Objects, and Low Integrity levels for process isolation.
 * Uses a native C# helper to bypass PowerShell restrictions.
 */
export class WindowsSandboxManager implements SandboxManager {
  static readonly HELPER_EXE = 'GeminiSandbox.exe';
  private readonly helperPath: string;
  private initialized = false;
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

  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return parseWindowsSandboxDenials(result);
  }

  getWorkspace(): string {
    return this.options.workspace;
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

    // 1. Workspace access
    const isApproved = allowOverrides
      ? await isStrictlyApproved(
          command,
          args,
          this.options.modeConfig?.approvedTools,
        )
      : false;

    if (!isReadonlyMode || isApproved) {
      await this.grantLowIntegrityAccess(this.options.workspace);
      writableRoots.push(this.options.workspace);
    }

    // 2. Globally included directories
    const includeDirs = sanitizePaths(this.options.includeDirectories);
    for (const includeDir of includeDirs) {
      await this.grantLowIntegrityAccess(includeDir);
      writableRoots.push(includeDir);
    }

    // 3. Explicitly allowed paths from the request policy
    for (const allowedPath of allowedPaths) {
      const resolved = resolveToRealPath(allowedPath);
      try {
        await fs.promises.access(resolved, fs.constants.F_OK);
      } catch {
        throw new Error(
          `Sandbox request rejected: Allowed path does not exist: ${resolved}. ` +
            'On Windows, granular sandbox access can only be granted to existing paths to avoid broad parent directory permissions.',
        );
      }
      await this.grantLowIntegrityAccess(resolved);
      writableRoots.push(resolved);
    }

    // 4. Additional write paths (e.g. from internal __write command)
    const additionalWritePaths = sanitizePaths(
      mergedAdditional.fileSystem?.write,
    );
    for (const writePath of additionalWritePaths) {
      const resolved = resolveToRealPath(writePath);
      try {
        await fs.promises.access(resolved, fs.constants.F_OK);
        await this.grantLowIntegrityAccess(resolved);
        continue;
      } catch {
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
    }

    // 2. Collect secret files and apply protective ACLs
    // On Windows, we explicitly deny access to secret files for Low Integrity
    // processes to ensure they cannot be read or written.
    const secretsToBlock: string[] = [];
    const searchDirs = new Set([
      this.options.workspace,
      ...allowedPaths,
      ...includeDirs,
    ]);
    for (const dir of searchDirs) {
      try {
        // We use maxDepth 3 to catch common nested secrets while keeping performance high.
        const secretFiles = await findSecretFiles(dir, 3);
        for (const secretFile of secretFiles) {
          try {
            secretsToBlock.push(secretFile);
            await this.denyLowIntegrityAccess(secretFile);
          } catch (e) {
            debugLogger.log(
              `WindowsSandboxManager: Failed to secure secret file ${secretFile}`,
              e,
            );
          }
        }
      } catch (e) {
        debugLogger.log(
          `WindowsSandboxManager: Failed to find secret files in ${dir}`,
          e,
        );
      }
    }

    // Denies access to forbiddenPaths for Low Integrity processes.
    // Note: Denying access to arbitrary paths (like system files) via icacls
    // is restricted to avoid host corruption. External commands rely on
    // Low Integrity read/write restrictions, while internal commands
    // use the manifest for enforcement.
    for (const forbiddenPath of forbiddenPaths) {
      try {
        await this.denyLowIntegrityAccess(forbiddenPath);
      } catch (e) {
        debugLogger.log(
          `WindowsSandboxManager: Failed to secure forbidden path ${forbiddenPath}`,
          e,
        );
      }
    }

    // 3. Protected governance files
    // These must exist on the host before running the sandbox to prevent
    // the sandboxed process from creating them with Low integrity.
    // By being created as Medium integrity, they are write-protected from Low processes.
    for (const file of GOVERNANCE_FILES) {
      const filePath = path.join(this.options.workspace, file.path);
      this.touch(filePath, file.isDirectory);
    }

    // 4. Forbidden paths manifest
    // We use a manifest file to avoid command-line length limits.
    const allForbidden = Array.from(
      new Set([...secretsToBlock, ...forbiddenPaths]),
    );
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-forbidden-'),
    );
    const manifestPath = path.join(tempDir, 'manifest.txt');
    fs.writeFileSync(manifestPath, allForbidden.join('\n'));

    // 5. Construct the helper command
    // GeminiSandbox.exe <network:0|1> <cwd> --forbidden-manifest <path> <command> [args...]
    const program = this.helperPath;

    const finalArgs = [
      networkAccess ? '1' : '0',
      req.cwd,
      '--forbidden-manifest',
      manifestPath,
      command,
      ...args,
    ];

    const finalEnv = { ...sanitizedEnv };

    return {
      program,
      args: finalArgs,
      env: finalEnv,
      cwd: req.cwd,
      cleanup: () => {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore errors
        }
      },
    };
  }

  /**
   * Grants "Low Mandatory Level" access to a path using icacls.
   */
  private async grantLowIntegrityAccess(targetPath: string): Promise<void> {
    if (os.platform() !== 'win32') {
      return;
    }

    const resolvedPath = resolveToRealPath(targetPath);
    if (this.allowedCache.has(resolvedPath)) {
      return;
    }

    // Explicitly reject UNC paths to prevent credential theft/SSRF,
    // but allow local extended-length and device paths.
    if (
      resolvedPath.startsWith('\\\\') &&
      !resolvedPath.startsWith('\\\\?\\') &&
      !resolvedPath.startsWith('\\\\.\\')
    ) {
      debugLogger.log(
        'WindowsSandboxManager: Rejecting UNC path for Low Integrity grant:',
        resolvedPath,
      );
      return;
    }

    if (this.isSystemDirectory(resolvedPath)) {
      return;
    }

    try {
      // 1. Grant explicit Modify access to the Low Integrity SID
      // 2. Set the Mandatory Label to Low to allow "Write Up" from Low processes
      await spawnAsync('icacls', [
        resolvedPath,
        '/grant',
        `${LOW_INTEGRITY_SID}:(OI)(CI)(M)`,
        '/setintegritylevel',
        '(OI)(CI)Low',
      ]);
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

    const resolvedPath = resolveToRealPath(targetPath);
    if (this.deniedCache.has(resolvedPath)) {
      return;
    }

    // Never modify ACEs for system directories
    if (this.isSystemDirectory(resolvedPath)) {
      return;
    }

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
