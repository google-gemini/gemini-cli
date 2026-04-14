/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path, { join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  type SandboxManager,
  type SandboxRequest,
  type SandboxedCommand,
  GOVERNANCE_FILES,
  findSecretFiles,
  type GlobalSandboxOptions,
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
import {
  isKnownSafeCommand,
  isDangerousCommand,
  isStrictlyApproved,
} from './commandSafety.js';
import { verifySandboxOverrides } from '../utils/commandUtils.js';
import { parseWindowsSandboxDenials } from './windowsSandboxDenialUtils.js';
import { isErrnoException } from '../utils/fsUtils.js';
import {
  isSubpath,
  resolveToRealPath,
  assertValidPathString,
} from '../../utils/paths.js';
import {
  type SandboxDenialCache,
  createSandboxDenialCache,
} from '../utils/sandboxDenialUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * A SandboxManager implementation for Windows that uses Restricted Tokens,
 * Job Objects, and Low Integrity levels for process isolation.
 * Uses a native C# helper to bypass PowerShell restrictions.
 */
export class WindowsSandboxManager implements SandboxManager {
  static readonly HELPER_EXE = 'GeminiSandbox.exe';

  private readonly helperPath: string;
  private readonly denialCache: SandboxDenialCache = createSandboxDenialCache();

  private static helperCompiled = false;
  private governanceFilesInitialized = false;

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
    return parseWindowsSandboxDenials(result, this.denialCache);
  }

  getWorkspace(): string {
    return this.options.workspace;
  }

  getOptions(): GlobalSandboxOptions {
    return this.options;
  }

  private ensureGovernanceFilesExist(workspace: string): void {
    if (this.governanceFilesInitialized) return;

    // These must exist on the host before running the sandbox to ensure they are protected.
    for (const file of GOVERNANCE_FILES) {
      const filePath = join(workspace, file.path);
      touch(filePath, file.isDirectory);
    }

    this.governanceFilesInitialized = true;
  }

  private async ensureHelperCompiled(): Promise<void> {
    if (WindowsSandboxManager.helperCompiled || os.platform() !== 'win32') {
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

    WindowsSandboxManager.helperCompiled = true;
  }

  /**
   * Prepares a command for sandboxed execution on Windows.
   */
  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    await this.ensureHelperCompiled();

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

    const resolvedPaths = await resolveSandboxPaths(
      this.options,
      req,
      mergedAdditional,
    );

    this.ensureGovernanceFilesExist(resolvedPaths.workspace.resolved);

    // 1. Collect all forbidden paths.
    // We start with explicitly forbidden paths from the options and request.
    const forbiddenManifest = new Set(
      resolvedPaths.forbidden.map((p) => resolveToRealPath(p)),
    );

    // On Windows, we explicitly deny access to secret files for Low Integrity processes.
    // We scan common search directories (workspace, allowed paths) for secrets.
    const searchDirs = new Set([
      resolvedPaths.workspace.resolved,
      ...resolvedPaths.policyAllowed,
      ...resolvedPaths.globalIncludes,
    ]);

    const secretFilesPromises = Array.from(searchDirs).map(async (dir) => {
      try {
        // We use maxDepth 3 to catch common nested secrets while keeping performance high.
        const secretFiles = await findSecretFiles(dir, 3);
        for (const secretFile of secretFiles) {
          forbiddenManifest.add(resolveToRealPath(secretFile));
        }
      } catch (e) {
        debugLogger.log(
          `WindowsSandboxManager: Failed to find secret files in ${dir}`,
          e,
        );
      }
    });

    await Promise.all(secretFilesPromises);

    // 2. Track paths that will be granted write access.
    // 'allowedManifest' contains resolved paths for the C# helper to apply ACLs.
    // 'inheritanceRoots' contains both original and resolved paths for Node.js sub-path validation.
    const allowedManifest = new Set<string>();
    const inheritanceRoots = new Set<string>();

    const addWritableRoot = (p: string) => {
      const resolved = resolveToRealPath(p);

      // Track both versions for inheritance checks to be robust against symlinks.
      inheritanceRoots.add(p);
      inheritanceRoots.add(resolved);

      // Never grant access to system directories or explicitly forbidden paths.
      if (this.isSystemDirectory(resolved)) return;
      if (forbiddenManifest.has(resolved)) return;

      // Explicitly reject UNC paths to prevent credential theft/SSRF,
      // but allow local extended-length and device paths.
      if (
        resolved.startsWith('\\\\') &&
        !resolved.startsWith('\\\\?\\') &&
        !resolved.startsWith('\\\\.\\')
      ) {
        debugLogger.log(
          'WindowsSandboxManager: Rejecting UNC path for allowed manifest:',
          resolved,
        );
        return;
      }
      allowedManifest.add(resolved);
    };

    // 3. Populate writable roots from various sources.

    // A. Workspace access
    const isApproved = allowOverrides
      ? await isStrictlyApproved(
          command,
          args,
          this.options.modeConfig?.approvedTools,
        )
      : false;

    const workspaceWrite = !isReadonlyMode || isApproved || isYolo;

    if (workspaceWrite) {
      addWritableRoot(resolvedPaths.workspace.resolved);
    }

    // B. Globally included directories
    for (const includeDir of resolvedPaths.globalIncludes) {
      addWritableRoot(includeDir);
    }

    // C. Explicitly allowed paths from the request policy
    for (const allowedPath of resolvedPaths.policyAllowed) {
      try {
        await fs.promises.access(allowedPath, fs.constants.F_OK);
      } catch {
        throw new Error(
          `Sandbox request rejected: Allowed path does not exist: ${allowedPath}. ` +
            'On Windows, granular sandbox access can only be granted to existing paths to avoid broad parent directory permissions.',
        );
      }
      addWritableRoot(allowedPath);
    }

    // D. Additional write paths (e.g. from internal __write command)
    for (const writePath of resolvedPaths.policyWrite) {
      try {
        await fs.promises.access(writePath, fs.constants.F_OK);
        addWritableRoot(writePath);
        continue;
      } catch {
        // If the file doesn't exist, it's only allowed if it resides within a granted root.
        const isInherited = Array.from(inheritanceRoots).some((root) =>
          isSubpath(root, writePath),
        );

        if (!isInherited) {
          throw new Error(
            `Sandbox request rejected: Additional write path does not exist and its parent directory is not allowed: ${writePath}. ` +
              'On Windows, granular sandbox access can only be granted to existing paths to avoid broad parent directory permissions.',
          );
        }
      }
    }

    // Support git worktrees/submodules; read-only to prevent malicious hook/config modification (RCE).
    // Read access is inherited; skip addWritableRoot to ensure write protection.
    if (resolvedPaths.gitWorktree) {
      // No-op for read access on Windows.
    }

    // 5. Generate Manifests
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'gemini-cli-sandbox-'),
    );

    const forbiddenManifestPath = path.join(tempDir, 'forbidden.txt');
    await fs.promises.writeFile(
      forbiddenManifestPath,
      Array.from(forbiddenManifest).join('\n'),
    );

    const allowedManifestPath = path.join(tempDir, 'allowed.txt');
    await fs.promises.writeFile(
      allowedManifestPath,
      Array.from(allowedManifest).join('\n'),
    );

    // 6. Construct the helper command
    const program = this.helperPath;

    const finalArgs = [
      networkAccess ? '1' : '0',
      req.cwd,
      '--forbidden-manifest',
      forbiddenManifestPath,
      '--allowed-manifest',
      allowedManifestPath,
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

/**
 * Ensures a file or directory exists.
 */
function touch(filePath: string, isDirectory: boolean): void {
  assertValidPathString(filePath);
  try {
    // If it exists (even as a broken symlink), do nothing
    fs.lstatSync(filePath);
    return;
  } catch (e: unknown) {
    if (isErrnoException(e) && e.code !== 'ENOENT') {
      throw e;
    }
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
