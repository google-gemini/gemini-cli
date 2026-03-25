/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
  type EnvironmentSanitizationConfig,
} from './environmentSanitization.js';
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
  /** Absolute paths to explicitly deny read/write access to (overrides allowlists). */
  forbiddenPaths?: string[];
  /** Whether network access is allowed. */
  networkAccess?: boolean;
  /** Rules for scrubbing sensitive environment variables. */
  sanitizationConfig?: Partial<EnvironmentSanitizationConfig>;
  /** Additional granular permissions to grant to this command. */
  additionalPermissions?: SandboxPermissions;
}

/**
 * Global configuration options used to initialize a SandboxManager.
 */
export interface GlobalSandboxOptions {
  /**
   * The primary workspace path the sandbox is anchored to.
   * This directory is granted full read and write access.
   */
  workspace: string;
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
}

/**
 * Interface for a service that prepares commands for sandboxed execution.
 */
export interface SandboxManager {
  /**
   * Prepares a command to run in a sandbox, including environment sanitization.
   */
  prepareCommand(req: SandboxRequest): Promise<SandboxedCommand>;
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
}

/**
 * SandboxManager that implements actual sandboxing.
 */
export class LocalSandboxManager implements SandboxManager {
  async prepareCommand(_req: SandboxRequest): Promise<SandboxedCommand> {
    throw new Error('Tool sandboxing is not yet implemented.');
  }
}

/**
 * Sanitizes an array of paths by deduplicating them and ensuring they are absolute.
 */
export function sanitizePaths(paths?: string[]): string[] | undefined {
  if (!paths) return undefined;

  // We use a Map to deduplicate paths based on their normalized,
  // platform-specific identity e.g. handling case-insensitivity on Windows)
  // while preserving the original string casing.
  const uniquePathsMap = new Map<string, string>();
  for (const p of paths) {
    if (!path.isAbsolute(p)) {
      throw new Error(`Sandbox path must be absolute: ${p}`);
    }

    // Normalize the path (resolves slashes and redundant components)
    let key = path.normalize(p);

    // Windows file systems are case-insensitive, so we lowercase the key for
    // deduplication
    if (os.platform() === 'win32') {
      key = key.toLowerCase();
    }

    if (!uniquePathsMap.has(key)) {
      uniquePathsMap.set(key, p);
    }
  }

  return Array.from(uniquePathsMap.values());
}
export { createSandboxManager } from './sandboxManagerFactory.js';
