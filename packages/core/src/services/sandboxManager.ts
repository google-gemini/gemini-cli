/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import {
  isKnownSafeCommand as isPosixSafeCommand,
  isDangerousCommand as isPosixDangerousCommand,
} from '../sandbox/utils/commandSafety.js';
import {
  isKnownSafeCommand as isWindowsSafeCommand,
  isDangerousCommand as isWindowsDangerousCommand,
} from '../sandbox/windows/commandSafety.js';
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
  yolo?: boolean;
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

  /**
   * Returns the primary workspace directory for this sandbox.
   */
  getWorkspace(): string;

  /**
   * Returns the global sandbox options for this sandbox.
   */
  getOptions(): GlobalSandboxOptions | undefined;
}

/**
 * A no-op implementation of SandboxManager that silently passes commands
 * through while applying environment sanitization.
 */
export class NoopSandboxManager implements SandboxManager {
  constructor(private options?: GlobalSandboxOptions) {}

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
      : isPosixSafeCommand(args);
  }

  isDangerousCommand(args: string[]): boolean {
    return os.platform() === 'win32'
      ? isWindowsDangerousCommand(args)
      : isPosixDangerousCommand(args);
  }

  parseDenials(): undefined {
    return undefined;
  }

  getWorkspace(): string {
    return this.options?.workspace ?? process.cwd();
  }

  getOptions(): GlobalSandboxOptions | undefined {
    return this.options;
  }
}

/**
 * A SandboxManager implementation that just runs locally (no sandboxing yet).
 */
export class LocalSandboxManager implements SandboxManager {
  constructor(private options?: GlobalSandboxOptions) {}

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

  getWorkspace(): string {
    return this.options?.workspace ?? process.cwd();
  }

  getOptions(): GlobalSandboxOptions | undefined {
    return this.options;
  }
}
