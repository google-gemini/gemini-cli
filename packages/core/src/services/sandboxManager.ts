/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  isKnownSafeCommand as isMacSafeCommand,
  isDangerousCommand as isMacDangerousCommand,
} from '../sandbox/utils/commandSafety.js';
import {
  isKnownSafeCommand as isWindowsSafeCommand,
  isDangerousCommand as isWindowsDangerousCommand,
} from '../sandbox/windows/commandSafety.js';
import { isNodeError } from '../utils/errors.js';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
  type EnvironmentSanitizationConfig,
} from './environmentSanitization.js';
import type { ShellExecutionResult } from './shellExecutionService.js';
import type { SandboxPolicyManager } from '../policy/sandboxPolicyManager.js';
export interface SandboxPermissions {
  /** Filesystem permissions. */
  fileSystem?: {
    /** Paths that should be readable by the command. */
    read?: string[];
    /** Paths that should be writable by the command. */
    write?: string[];
  };
  /** Whether the command should have network access. */
  network?: boolean;
}

/**
 * Security boundaries and permissions applied to a specific sandboxed execution.
 */
export interface ExecutionPolicy {
  /** Additional absolute paths to grant full read/write access to. */
  allowedPaths?: string[];
  /** Whether network access is allowed. */
  networkAccess?: boolean;
  /** Rules for scrubbing sensitive environment variables. */
  sanitizationConfig?: Partial<EnvironmentSanitizationConfig>;
  /** Additional granular permissions to grant to this command. */
  additionalPermissions?: SandboxPermissions;
}

/**
 * Configuration for the sandbox mode behavior.
 */
export interface SandboxModeConfig {
  readonly?: boolean;
  network?: boolean;
  approvedTools?: string[];
  allowOverrides?: boolean;
}

/**
 * Global configuration options used to initialize a SandboxManager.
 */
export interface GlobalSandboxOptions {
  /** The absolute path to the primary workspace directory, granted full read/write access. */
  workspace: string;
  /** Absolute paths to explicitly include in the workspace context. */
  includeDirectories?: string[];
  /** An optional asynchronous resolver function for paths that should be explicitly denied. */
  forbiddenPaths?: () => Promise<string[]>;
  /** The current sandbox mode behavior from config. */
  modeConfig?: SandboxModeConfig;
  /** The policy manager for persistent approvals. */
  policyManager?: SandboxPolicyManager;
}

/**
 * Request for preparing a command to run in a sandbox.
 */
export interface SandboxRequest {
  /** The program to execute. */
  command: string;
  /** Arguments for the program. */
  args: string[];
  /** The working directory. */
  cwd: string;
  /** Environment variables to be passed to the program. */
  env: NodeJS.ProcessEnv;
  /** Policy to use for this request. */
  policy?: ExecutionPolicy;
}

/**
 * A command that has been prepared for sandboxed execution.
 */
export interface SandboxedCommand {
  /** The program or wrapper to execute. */
  program: string;
  /** Final arguments for the program. */
  args: string[];
  /** Sanitized environment variables. */
  env: NodeJS.ProcessEnv;
  /** The working directory. */
  cwd?: string;
  /** An optional cleanup function to be called after the command terminates. */
  cleanup?: () => void;
}

/**
 * A structured result from parsing sandbox denials.
 */
export interface ParsedSandboxDenial {
  /** If the denial is related to file system access, these are the paths that were blocked. */
  filePaths?: string[];
  /** If the denial is related to network access. */
  network?: boolean;
}

/**
 * Interface for a service that prepares commands for sandboxed execution.
 */
export interface SandboxManager {
  /**
   * Prepares a command to run in a sandbox, including environment sanitization.
   */
  prepareCommand(req: SandboxRequest): Promise<SandboxedCommand>;

  /**
   * Checks if a command with its arguments is known to be safe for this sandbox.
   */
  isKnownSafeCommand(args: string[]): boolean;

  /**
   * Checks if a command with its arguments is explicitly known to be dangerous for this sandbox.
   */
  isDangerousCommand(args: string[]): boolean;

  /**
   * Parses the output of a command to detect sandbox denials.
   */
  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined;
}

/**
 * Files that represent the governance or "constitution" of the repository
 * and should be write-protected in any sandbox.
 */
export const GOVERNANCE_FILES = [
  { path: '.gitignore', isDirectory: false },
  { path: '.geminiignore', isDirectory: false },
  { path: '.git', isDirectory: true },
] as const;

/**
 * Files that contain sensitive secrets or credentials and should be
 * completely hidden (deny read/write) in any sandbox.
 */
export const SECRET_FILES = [
  { pattern: '.env' },
  { pattern: '.env.*' },
] as const;

/**
 * Checks if a given file name matches any of the secret file patterns.
 */
export function isSecretFile(fileName: string): boolean {
  return SECRET_FILES.some((s) => {
    if (s.pattern.endsWith('*')) {
      const prefix = s.pattern.slice(0, -1);
      return fileName.startsWith(prefix);
    }
    return fileName === s.pattern;
  });
}

/**
 * Returns arguments for the Linux 'find' command to locate secret files.
 */
export function getSecretFileFindArgs(): string[] {
  const args: string[] = ['('];
  SECRET_FILES.forEach((s, i) => {
    if (i > 0) args.push('-o');
    args.push('-name', s.pattern);
  });
  args.push(')');
  return args;
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
      const entries = await fs.readdir(dir, { withFileTypes: true });
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

/**
 * A no-op implementation of SandboxManager that silently passes commands
 * through while applying environment sanitization.
 */
export class NoopSandboxManager implements SandboxManager {
  /**
   * Prepares a command by sanitizing the environment and passing through
   * the original program and arguments.
   */
  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    const sanitizationConfig = getSecureSanitizationConfig(
      req.policy?.sanitizationConfig,
    );

    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    return {
      program: req.command,
      args: req.args,
      env: sanitizedEnv,
    };
  }

  isKnownSafeCommand(args: string[]): boolean {
    return os.platform() === 'win32'
      ? isWindowsSafeCommand(args)
      : isMacSafeCommand(args);
  }

  isDangerousCommand(args: string[]): boolean {
    return os.platform() === 'win32'
      ? isWindowsDangerousCommand(args)
      : isMacDangerousCommand(args);
  }

  parseDenials(): undefined {
    return undefined;
  }
}

/**
 * A SandboxManager implementation that just runs locally (no sandboxing yet).
 */
export class LocalSandboxManager implements SandboxManager {
  async prepareCommand(_req: SandboxRequest): Promise<SandboxedCommand> {
    throw new Error('Tool sandboxing is not yet implemented.');
  }

  isKnownSafeCommand(_args: string[]): boolean {
    return false;
  }

  isDangerousCommand(_args: string[]): boolean {
    return false;
  }

  parseDenials(): undefined {
    return undefined;
  }
}

/**
 * Resolves sanitized allowed and forbidden paths for a request.
 * Filters the workspace from allowed paths and ensures forbidden paths take precedence.
 */
export async function resolveSandboxPaths(
  options: GlobalSandboxOptions,
  req: SandboxRequest,
): Promise<{
  allowed: string[];
  forbidden: string[];
}> {
  const forbidden = sanitizePaths(await options.forbiddenPaths?.());
  const allowed = sanitizePaths(req.policy?.allowedPaths);

  const workspaceIdentity = getPathIdentity(options.workspace);
  const forbiddenIdentities = new Set(forbidden.map(getPathIdentity));

  const filteredAllowed = allowed.filter((p) => {
    const identity = getPathIdentity(p);
    return identity !== workspaceIdentity && !forbiddenIdentities.has(identity);
  });

  return {
    allowed: filteredAllowed,
    forbidden,
  };
}

/**
 * Sanitizes an array of paths by deduplicating them and ensuring they are absolute.
 * Always returns an array (empty if input is null/undefined).
 */
export function sanitizePaths(paths?: string[] | null): string[] {
  if (!paths || paths.length === 0) return [];

  const uniquePathsMap = new Map<string, string>();
  for (const p of paths) {
    if (!path.isAbsolute(p)) {
      throw new Error(`Sandbox path must be absolute: ${p}`);
    }

    const key = getPathIdentity(p);
    if (!uniquePathsMap.has(key)) {
      uniquePathsMap.set(key, p);
    }
  }

  return Array.from(uniquePathsMap.values());
}

/** Returns a normalized identity for a path, stripping trailing slashes and handling case sensitivity. */
export function getPathIdentity(p: string): string {
  let norm = path.normalize(p);

  // Strip trailing slashes (except for root paths)
  if (norm.length > 1 && (norm.endsWith('/') || norm.endsWith('\\'))) {
    norm = norm.slice(0, -1);
  }

  const platform = os.platform();
  const isCaseInsensitive = platform === 'win32' || platform === 'darwin';
  return isCaseInsensitive ? norm.toLowerCase() : norm;
}

/**
 * Resolves symlinks for a given path to prevent sandbox escapes.
 * If a file does not exist (ENOENT), it recursively resolves the parent directory.
 * Other errors (e.g. EACCES) are re-thrown.
 */
export async function tryRealpath(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch (e) {
    if (isNodeError(e) && e.code === 'ENOENT') {
      const parentDir = path.dirname(p);
      if (parentDir === p) {
        return p;
      }
      return path.join(await tryRealpath(parentDir), path.basename(p));
    }
    throw e;
  }
}

export { createSandboxManager } from './sandboxManagerFactory.js';
