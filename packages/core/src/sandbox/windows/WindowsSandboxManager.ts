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
    // Determine the helper path based on the execution environment.
    // In SEA (Single Executable), the files are extracted to a known structure.
    const seaExtractionDir = process.env['GEMINI_RUNTIME_DIR'];
    if (seaExtractionDir) {
      this.helperPath = path.resolve(
        seaExtractionDir,
        'sandbox/windows/GeminiSandbox.exe',
      );
    } else {
      // Development mode / source execution
      this.helperPath = path.resolve(__dirname, 'GeminiSandbox.exe');
    }
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
  private async touch(filePath: string, isDirectory: boolean): Promise<void> {
    try {
      // If it exists (even as a broken symlink), do nothing
      await fs.promises.lstat(filePath);
      return;
    } catch {
      // Ignore ENOENT
    }

    if (isDirectory) {
      await fs.promises.mkdir(filePath, { recursive: true });
    } else {
      const dir = path.dirname(filePath);
      const dirExists = await fs.promises
        .stat(dir)
        .then(() => true)
        .catch(() => false);
      if (!dirExists) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      const handle = await fs.promises.open(filePath, 'a');
      await handle.close();
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (os.platform() !== 'win32') {
      this.initialized = true;
      return;
    }

    try {
      const helperExists = await fs.promises
        .stat(this.helperPath)
        .then(() => true)
        .catch(() => false);

      if (!helperExists) {
        debugLogger.log(
          `WindowsSandboxManager: Helper not found at ${this.helperPath}. Attempting to compile...`,
        );
        // If the exe doesn't exist, we try to compile it from the .cs file
        const sourcePath = this.helperPath.replace(/\.exe$/, '.cs');
        const sourceExists = await fs.promises
          .stat(sourcePath)
          .then(() => true)
          .catch(() => false);

        if (sourceExists) {
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

    const defaultNetwork =
      this.options.modeConfig?.network || req.policy?.networkAccess || false;
    const networkAccess = defaultNetwork || mergedAdditional.network;

    // 1. Handle filesystem permissions for Low Integrity
    // Grant "Low Mandatory Level" write access to the workspace.
    // If not in readonly mode OR it's a strictly approved pipeline, allow workspace writes
    const isApproved = allowOverrides
      ? await isStrictlyApproved(
          req.command,
          req.args,
          this.options.modeConfig?.approvedTools,
        )
      : false;

    if (!isReadonlyMode || isApproved) {
      await this.grantLowIntegrityAccess(this.options.workspace);
    }

    // Grant "Low Mandatory Level" read/write access to allowedPaths.
    const allowedPaths = sanitizePaths(req.policy?.allowedPaths) || [];
    for (const allowedPath of allowedPaths) {
      await this.grantLowIntegrityAccess(allowedPath);
    }

    // Grant "Low Mandatory Level" write access to additional permissions write paths.
    const additionalWritePaths =
      sanitizePaths(mergedAdditional.fileSystem?.write) || [];
    for (const writePath of additionalWritePaths) {
      await this.grantLowIntegrityAccess(writePath);
    }

    // 2. Collect secret files and apply protective ACLs
    // On Windows, we explicitly deny access to secret files for Low Integrity
    // processes to ensure they cannot be read or written.
    const secretsToBlock: string[] = [];
    const searchDirs = new Set([this.options.workspace, ...allowedPaths]);
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
    const forbiddenPaths = sanitizePaths(this.options.forbiddenPaths) || [];
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
      await this.touch(filePath, file.isDirectory);
    }

    // 4. Forbidden paths manifest
    const { manifestPath, cleanup } =
      await this.generateForbiddenManifest(secretsToBlock);

    // GeminiSandbox.exe <network:0|1> <cwd> --forbidden-manifest <path> <command> [args...]
    const program = this.helperPath;

    const args = [
      networkAccess ? '1' : '0',
      req.cwd,
      '--forbidden-manifest',
      manifestPath,
      req.command,
      ...(req.args || []),
    ];

    return {
      program,
      args,
      env: sanitizedEnv,
      cwd: req.cwd,
      cleanup,
    };
  }

  /**
   * Generates a manifest file of forbidden paths for the native helper.
   */
  private async generateForbiddenManifest(secretsToBlock: string[]): Promise<{
    manifestPath: string;
    cleanup: () => void;
  }> {
    const forbiddenPaths = sanitizePaths(this.options.forbiddenPaths) || [];
    const allForbidden = Array.from(
      new Set([...secretsToBlock, ...forbiddenPaths]),
    );
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'gemini-cli-forbidden-'),
    );
    const manifestPath = path.join(tempDir, 'manifest.txt');
    await fs.promises.writeFile(manifestPath, allForbidden.join('\n'));

    const cleanup = () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore errors
      }
    };

    return { manifestPath, cleanup };
  }

  /**
   * Grants "Low Mandatory Level" access to a path using the native helper.
   */
  private async grantLowIntegrityAccess(targetPath: string): Promise<void> {
    if (os.platform() !== 'win32') {
      return;
    }

    const resolvedPath = await tryRealpath(targetPath);
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
      await spawnAsync(this.helperPath, ['__grant', resolvedPath]);
      this.allowedCache.add(resolvedPath);
    } catch (e) {
      debugLogger.log(
        'WindowsSandboxManager: Native grant failed for',
        resolvedPath,
        e,
      );
    }
  }

  /**
   * Explicitly denies access to a path for Low Integrity processes using the native helper.
   */
  private async denyLowIntegrityAccess(targetPath: string): Promise<void> {
    if (os.platform() !== 'win32') {
      return;
    }

    const resolvedPath = await tryRealpath(targetPath);
    if (this.deniedCache.has(resolvedPath)) {
      return;
    }

    // Never modify ACEs for system directories
    if (this.isSystemDirectory(resolvedPath)) {
      return;
    }

    // Check if the path exists
    try {
      await fs.promises.stat(resolvedPath);
    } catch (e: unknown) {
      if (isNodeError(e) && e.code === 'ENOENT') {
        return;
      }
      throw e;
    }

    try {
      await spawnAsync(this.helperPath, ['__deny', resolvedPath]);
      this.deniedCache.add(resolvedPath);
    } catch (e) {
      throw new Error(
        `Failed to deny access to forbidden path using native helper: ${resolvedPath}. ${
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
