/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type {
  SandboxRequest,
  SandboxedCommand,
  SandboxPermissions,
  ParsedSandboxDenial,
  GlobalSandboxOptions,
} from '../../services/sandboxManager.js';
import { SECRET_FILES } from '../constants.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import { ensureGovernanceFilesExist } from '../utils/governanceUtils.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { spawnAsync } from '../../utils/shell-utils.js';
import {
  isKnownSafeCommand as isWindowsSafeCommand,
  isDangerousCommand as isWindowsDangerousCommand,
  isStrictlyApproved as isWindowsStrictlyApproved,
} from './commandSafety.js';
import { parseWindowsSandboxDenials } from './windowsSandboxDenialUtils.js';
import { isSubpath, resolveToRealPath } from '../../utils/paths.js';
import {
  AbstractOsSandboxManager,
  type PreparedExecutionDetails,
} from '../abstractOsSandboxManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * A SandboxManager implementation for Windows that uses Restricted Tokens,
 * Job Objects, and Low Integrity levels for process isolation.
 * Uses a native C# helper to bypass PowerShell restrictions.
 */
export class WindowsSandboxManager extends AbstractOsSandboxManager {
  static readonly HELPER_EXE = 'GeminiSandbox.exe';
  private static helperCompiled = false;

  private readonly helperPath: string;

  constructor(options: GlobalSandboxOptions) {
    super(options);
    this.helperPath = path.resolve(__dirname, WindowsSandboxManager.HELPER_EXE);
  }

  protected override async initialize(): Promise<void> {
    await this.ensureHelperCompiled();
  }

  protected override ensureGovernanceFilesExist(workspace: string): void {
    if (this.governanceFilesInitialized) return;
    ensureGovernanceFilesExist(workspace);
    this.governanceFilesInitialized = true;
  }

  /**
   * Windows supports virtual commands directly via the native helper execution.
   * No translation is required.
   */
  protected override mapVirtualCommandToNative(
    command: string,
    args: string[],
  ): { command: string; args: string[] } {
    return { command, args };
  }

  /**
   * Windows requires explicit tracking of requested read/write file targets
   * to add them dynamically to the allowed and inheritance roots manifest.
   */
  protected override updateReadWritePermissions(
    permissions: SandboxPermissions,
    req: SandboxRequest,
  ): void {
    if (req.command === '__read' && req.args[0]) {
      permissions.fileSystem?.read?.push(req.args[0]);
    } else if (req.command === '__write' && req.args[0]) {
      permissions.fileSystem?.write?.push(req.args[0]);
    }
  }

  /**
   * Windows does not require command string rewriting as strict file system
   * isolation is enforced independently at the native OS process level.
   */
  protected override rewriteReadWriteCommand(
    _req: SandboxRequest,
    command: string,
    args: string[],
    _permissions: SandboxPermissions,
  ): { command: string; args: string[] } {
    return { command, args };
  }

  protected async buildSandboxedCommand(
    details: PreparedExecutionDetails,
  ): Promise<SandboxedCommand> {
    const {
      finalCommand,
      finalArgs,
      sanitizedEnv,
      resolvedPaths,
      workspaceWrite,
      networkAccess,
      req,
    } = details;

    // Collect all forbidden paths.
    const forbiddenManifest = new Set(
      resolvedPaths.forbidden.map((p) => resolveToRealPath(p)),
    );

    const searchDirs = new Set([
      resolvedPaths.workspace.resolved,
      ...resolvedPaths.policyAllowed,
      ...resolvedPaths.globalIncludes,
    ]);

    const secretFilesPromises = Array.from(searchDirs).map(async (dir) => {
      try {
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

    // Track paths that will be granted write access.
    const allowedManifest = new Set<string>();
    const inheritanceRoots = new Set<string>();

    const addWritableRoot = (p: string) => {
      const resolved = resolveToRealPath(p);
      inheritanceRoots.add(p);
      inheritanceRoots.add(resolved);

      if (this.isSystemDirectory(resolved)) return;
      if (forbiddenManifest.has(resolved)) return;

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

    // Populate writable roots.
    if (workspaceWrite) {
      addWritableRoot(resolvedPaths.workspace.resolved);
    }

    for (const includeDir of resolvedPaths.globalIncludes) {
      addWritableRoot(includeDir);
    }

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

    for (const writePath of resolvedPaths.policyWrite) {
      try {
        await fs.promises.access(writePath, fs.constants.F_OK);
        addWritableRoot(writePath);
        continue;
      } catch {
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

    // Generate manifests
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

    // Construct the helper command
    const program = this.helperPath;

    const finalHelperArgs = [
      networkAccess ? '1' : '0',
      req.cwd,
      '--forbidden-manifest',
      forbiddenManifestPath,
      '--allowed-manifest',
      allowedManifestPath,
      finalCommand,
      ...finalArgs,
    ];

    const finalEnv = { ...sanitizedEnv };

    return {
      program,
      args: finalHelperArgs,
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

  protected override isCaseInsensitive(): boolean {
    return true;
  }

  isDangerousCommand(args: string[]): boolean {
    return isWindowsDangerousCommand(args);
  }

  protected override isOsSafeCommand(args: string[]): boolean {
    return isWindowsSafeCommand(args);
  }

  protected override async isStrictlyApproved(
    command: string,
    args: string[],
    _req: SandboxRequest,
  ): Promise<boolean> {
    return isWindowsStrictlyApproved(
      command,
      args,
      this.options.modeConfig?.approvedTools,
    );
  }

  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return parseWindowsSandboxDenials(result, this.denialCache);
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
}

/**
 * Finds all secret files in a directory up to a certain depth.
 * Default is shallow scan (depth 1) for performance.
 */
export async function findSecretFiles(
  baseDir: string,
  maxDepth = 1,
): Promise<string[]> {
  const secrets: string[] = [];
  const skipDirs = new Set([
    'node_modules',
    '.git',
    '.venv',
    '__pycache__',
    'dist',
    'build',
    '.next',
    '.idea',
    '.vscode',
  ]);

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!skipDirs.has(entry.name)) {
            await walk(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          if (isSecretFile(entry.name)) {
            secrets.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  await walk(baseDir, 1);
  return secrets;
}

export function isSecretFile(fileName: string): boolean {
  return SECRET_FILES.some((s) => {
    if (s.pattern.includes('*')) {
      const regex = new RegExp(
        '^' +
          s.pattern
            // Escape all regex special chars
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            // Convert the escaped asterisk back to a regex wildcard
            .replace(/\\\*/g, '.*') +
          '$',
      );
      return regex.test(fileName);
    }
    return fileName === s.pattern;
  });
}
