/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SECRET_FILES,
  AbstractOsSandboxManager,
} from '../abstractOsSandboxManager.js';

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { ResolvedSandboxPaths } from '../abstractOsSandboxManager.js';
import type {
  SandboxRequest,
  SandboxedCommand,
  GlobalSandboxOptions,
  SandboxPermissions,
  ParsedSandboxDenial,
} from '../../services/sandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { spawnAsync } from '../../utils/shell-utils.js';
import { isSubpath, resolveToRealPath } from '../../utils/paths.js';
import {
  isKnownSafeCommand as isWindowsSafeCommand,
  isDangerousCommand as isWindowsDangerousCommand,
} from './commandSafety.js';
import { parseWindowsSandboxDenials } from './windowsSandboxDenialUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * A SandboxManager implementation for Windows that uses Restricted Tokens,
 * Job Objects, and Low Integrity levels for process isolation.
 * Uses a native C# helper to bypass PowerShell restrictions.
 */
export class WindowsSandboxManager extends AbstractOsSandboxManager {
  static readonly HELPER_EXE = 'GeminiSandbox.exe';
  private readonly helperPath: string;
  private initialized = false;

  constructor(options: GlobalSandboxOptions) {
    super(options);
    this.helperPath = path.resolve(__dirname, WindowsSandboxManager.HELPER_EXE);
  }

  isKnownSafeCommand(args: string[]): boolean {
    const toolName = args[0];
    if (toolName && this.isToolApproved(toolName, true)) {
      return true;
    }
    return isWindowsSafeCommand(args);
  }

  isDangerousCommand(args: string[]): boolean {
    return isWindowsDangerousCommand(args);
  }

  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return parseWindowsSandboxDenials(result, this.denialCache);
  }

  protected get isCaseInsensitive(): boolean {
    return true;
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

  protected async buildSandboxedExecution(
    req: SandboxRequest,
    finalCmd: { command: string; args: string[] },
    sanitizedEnv: NodeJS.ProcessEnv,
    mergedAdditional: SandboxPermissions,
    resolvedPaths: ResolvedSandboxPaths,
    workspaceWrite: boolean,
  ): Promise<SandboxedCommand> {
    await this.ensureInitialized();

    const networkAccess = mergedAdditional.network;
    const command = finalCmd.command;
    const args = finalCmd.args;

    // Collect all forbidden paths.
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

    // Track paths that will be granted write access.
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

    // Populate writable roots from various sources.

    if (workspaceWrite) {
      addWritableRoot(resolvedPaths.workspace.resolved);
    }

    // Globally included directories
    for (const includeDir of resolvedPaths.globalIncludes) {
      addWritableRoot(includeDir);
    }

    // Explicitly allowed paths from the request policy
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

    // Additional write paths (e.g. from internal __write command)
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

    // Generate Manifests
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
 * Checks if a given file name matches any of the secret file patterns.
 */
export function isSecretFile(fileName: string): boolean {
  return SECRET_FILES.some((s: { pattern: string }) => {
    if (s.pattern.endsWith('*')) {
      const prefix = s.pattern.slice(0, -1);
      return fileName.startsWith(prefix);
    }
    return fileName === s.pattern;
  });
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
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
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
