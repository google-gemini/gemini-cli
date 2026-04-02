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
  /**
   * Caches paths with modified ACLs to prevent redundant, costly Win32 API calls
   * across multiple command executions within the same session.
   */
  private readonly allowedCache = new Set<string>();
  private readonly deniedCache = new Set<string>();
  private manifestTempDir?: string;
  private readonly exitCleanupHandler: () => void;

  constructor(private readonly options: GlobalSandboxOptions) {
    this.helperPath = path.resolve(__dirname, 'GeminiSandbox.exe');
    this.exitCleanupHandler = () => this.cleanup();
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

    let command = req.command;
    let args = req.args;
    let targetPathEnv: string | undefined;

    // Translate virtual commands for sandboxed file system access
    if (command === '__read') {
      // Use PowerShell for safe argument passing via env var
      targetPathEnv = args[0] || '';
      command = 'PowerShell.exe';
      args = [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '& { Get-Content -LiteralPath $env:GEMINI_TARGET_PATH -Raw }',
      ];
    } else if (command === '__write') {
      // Use PowerShell for piping stdin to a file via env var
      targetPathEnv = args[0] || '';
      command = 'PowerShell.exe';
      args = [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '& { $Input | Out-File -FilePath $env:GEMINI_TARGET_PATH -Encoding utf8 }',
      ];
    }

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

    // 1. Determine filesystem permissions to grant
    const pathsToGrant = new Set<string>();

    // Grant write access if not readonly or tool is strictly approved
    const isApproved = allowOverrides
      ? await isStrictlyApproved(
          command,
          args,
          this.options.modeConfig?.approvedTools,
        )
      : false;

    if (!isReadonlyMode || isApproved) {
      pathsToGrant.add(this.options.workspace);
    }

    const { allowed: allowedPaths, forbidden: forbiddenPaths } =
      await resolveSandboxPaths(this.options, req);

    allowedPaths.forEach((p) => pathsToGrant.add(p));

    const extraWritePaths =
      sanitizePaths(mergedAdditional.fileSystem?.write) || [];
    extraWritePaths.forEach((p) => pathsToGrant.add(p));

    const includeDirs = sanitizePaths(this.options.includeDirectories);
    includeDirs.forEach((p) => pathsToGrant.add(p));

    // 2. Identify forbidden paths and secrets to deny
    const pathsToDeny = new Set<string>();
    forbiddenPaths.forEach((p) => pathsToDeny.add(p));

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
          secrets.forEach((s) => pathsToDeny.add(s));
        } catch (e) {
          debugLogger.log(
            `WindowsSandboxManager: Secret scan failed for ${dir}`,
            e,
          );
        }
      }),
    );

    // On Windows, granular sandbox access can only be granted to existing paths
    // to avoid broad parent directory permissions. Ensure all grant paths exist.
    for (const p of pathsToGrant) {
      if (pathsToDeny.has(p)) {
        pathsToGrant.delete(p);
        continue;
      }

      try {
        const resolved = await tryRealpath(p);
        await fs.promises.access(resolved, fs.constants.F_OK);
      } catch {
        // If it doesn't exist, we can't grant access on Windows.
        // This matches main branch behavior of throwing/skipping.
        pathsToGrant.delete(p);
      }
    }

    // 3. Generate setup manifest operations (L = Grant, D = Deny)
    const opResults = await Promise.all([
      ...Array.from(pathsToGrant).map((p) => this.getLowIntegrityOp(p, 'L')),
      ...Array.from(pathsToDeny).map((p) => this.getLowIntegrityOp(p, 'D')),
    ]);

    const pendingAcls = opResults.filter(
      (op): op is string => op !== undefined,
    );

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
      if (!this.manifestTempDir) {
        this.manifestTempDir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'gemini-cli-sandbox-'),
        );
        process.on('exit', this.exitCleanupHandler);
      }

      manifestPath = path.join(
        this.manifestTempDir,
        `acls-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
      );
      fs.writeFileSync(manifestPath, pendingAcls.join('\n'));
    }

    const finalEnv = { ...sanitizedEnv };
    if (targetPathEnv !== undefined) {
      finalEnv['GEMINI_TARGET_PATH'] = targetPathEnv;
    }

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

  cleanup(): void {
    if (this.manifestTempDir) {
      try {
        fs.rmSync(this.manifestTempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      this.manifestTempDir = undefined;
    }
    process.removeListener('exit', this.exitCleanupHandler);
  }
}
