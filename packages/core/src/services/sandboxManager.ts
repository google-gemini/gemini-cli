/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import toml from '@iarna/toml';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Defines different levels of access for the sandbox.
 */
export enum SandboxProfile {
  /**
   * Only allows read access to the workspace and specified paths.
   */
  READ_ONLY = 'READ_ONLY',
  /**
   * Allows both read and write access to the workspace and specified paths.
   */
  WORKSPACE_WRITE = 'WORKSPACE_WRITE',
}

/**
 * Represents a command that has been modified to run in a sandbox.
 */
export interface SandboxedCommand {
  /**
   * The program to execute (may be a sandbox utility like 'sandbox-exec').
   */
  program: string;
  /**
   * The arguments to pass to the program.
   */
  args: string[];
  /**
   * Optional cleanup function to be called after the command finishes.
   */
  cleanup?: () => void;
}

/**
 * Options for preparing a sandboxed command.
 */
export interface SandboxOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /**
   * The profile to use for sandboxing (e.g., READ_ONLY, WORKSPACE_WRITE).
   * Defaults to WORKSPACE_WRITE if not specified.
   */
  profile?: SandboxProfile;
  ephemeralRules?: string[];
}

/**
 * Manages the preparation and execution of sandboxed commands.
 */
export interface SandboxManager {
  /**
   * Prepares a command for sandboxed execution.
   *
   * @param options The options for the command.
   * @returns A promise that resolves to a SandboxedCommand.
   */
  prepareCommand(options: SandboxOptions): Promise<SandboxedCommand>;

  /**
   * Prepares a command for sandboxed execution synchronously.
   *
   * @param options The options for the command.
   * @returns A SandboxedCommand.
   */
  prepareCommandSync(options: SandboxOptions): SandboxedCommand;
}

/**
 * Standard implementation of the SandboxManager.
 */
export class StandardSandboxManager implements SandboxManager {
  constructor(private readonly config: Config) {}

  async prepareCommand(options: SandboxOptions): Promise<SandboxedCommand> {
    return this.prepareCommandSync(options);
  }

  prepareCommandSync(options: SandboxOptions): SandboxedCommand {
    const sandboxConfig = this.config.getSandbox();

    // If sandbox is not enabled or not configured, return the original command.
    if (!sandboxConfig?.enabled) {
      return {
        program: options.command,
        args: options.args,
      };
    }

    // Default to WORKSPACE_WRITE if not specified.
    const optionsWithProfile = {
      ...options,
      profile: options.profile ?? SandboxProfile.WORKSPACE_WRITE,
    };

    // Handle macOS Seatbelt sandboxing.
    if (process.platform === 'darwin') {
      try {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-sandbox-'));
        const profilePath = path.join(tempDir, 'sandbox.sb');
        
        // Start with explicitly allowed paths from config
        const allowedPaths = [...(sandboxConfig.allowedPaths || [])];

        try {
          const sandboxingTomlPath = path.join(path.resolve(options.cwd), '.gemini', 'sandboxing.toml');
          if (fs.existsSync(sandboxingTomlPath)) {
            const content = fs.readFileSync(sandboxingTomlPath, 'utf8');
            const parsed = toml.parse(content) as Record<string, unknown>;
            const sandboxSection = parsed?.['sandbox'] as Record<string, unknown> | undefined;
            if (sandboxSection?.['allowedPaths'] && Array.isArray(sandboxSection['allowedPaths'])) {
              allowedPaths.push(...(sandboxSection['allowedPaths'] as string[]));
            }
          }
        } catch (error) {
          debugLogger.error('Failed to parse .gemini/sandboxing.toml:', error);
        }

        fs.writeFileSync(
          profilePath,
          this.generateSeatbeltProfile(optionsWithProfile, allowedPaths),
        );

        return {
          program: '/usr/bin/sandbox-exec',
          args: ['-f', profilePath, options.command, ...options.args],
          cleanup: () => {
            try {
              fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (error) {
              debugLogger.error('macOS Sandbox cleanup failed:', error);
            }
          },
        };
      } catch (error) {
        debugLogger.error('macOS Sandbox setup failed:', error);
      }
    }

    return {
      program: options.command,
      args: options.args,
    };
  }

  /**
   * Generates a macOS Seatbelt (.sb) profile content.
   */
  private generateSeatbeltProfile(
    options: SandboxOptions,
    allowedPaths: string[],
  ): string {
    const isReadOnly = options.profile === SandboxProfile.READ_ONLY;
    const workspacePermission = isReadOnly ? 'file-read*' : 'file-read* file-write*';

    const rules = [
      '(version 1)',
      '(deny default)',
      '(allow process-fork)',
      '(allow process-exec)',
      '(allow signal (target same-sandbox))',
      '(allow signal (target self))',
      '(allow sysctl-read)',
      '(allow pseudo-tty)',
      '(allow mach-lookup)',
      '(allow network-outbound)',
      '(allow network-inbound (local ip "localhost:9229"))',

      // Essential system paths (Read-only)
      '(allow file-read*',
      '  (literal "/")',
      '  (subpath "/usr")',
      '  (subpath "/bin")',
      '  (subpath "/sbin")',
      '  (subpath "/Library")',
      '  (subpath "/System")',
      '  (subpath "/private")',
      '  (subpath "/dev")',
      '  (subpath "/etc")',
      '  (subpath "/opt")',
      '  (subpath "/Applications")',
      ')',

      // Executable mapping
      '(allow file-map-executable (subpath "/usr"))',
      '(allow file-map-executable (subpath "/System"))',
      '(allow file-map-executable (subpath "/bin"))',
      '(allow file-map-executable (subpath "/sbin"))',
      '(allow file-map-executable (subpath "/Library"))',

      // Standard special files and IOCTL
      '(allow file-read* file-write-data (literal "/dev/null"))',
      '(allow file-read* file-write-data (literal "/dev/zero"))',
      '(allow file-read* file-write* (literal "/dev/stdout"))',
      '(allow file-read* file-write* (literal "/dev/stderr"))',
      '(allow file-read* file-write* (literal "/dev/tty"))',
      '(allow file-ioctl (regex #"^/dev/tty.*"))',
      '(allow file-ioctl (literal "/dev/ptmx"))',

      // Project Workspace and Temp
      `(allow ${workspacePermission} (subpath "${path.resolve(options.cwd)}"))`,
      ...allowedPaths.map(p => `(allow ${workspacePermission} (subpath "${path.resolve(p)}"))`),
      '(allow file-read* file-write* (subpath "/private/tmp"))',
      '(allow file-read* file-write* (subpath "/tmp"))',
      '(allow file-read* file-write* (subpath "/var/tmp"))',
      '(allow file-read* file-write* (subpath "/private/var/folders"))',

      // SECURITY: Protect sensitive configuration files from being modified by the AI.
      // These rules override previous allows for the workspace.
      `(deny file-write* (literal "${path.join(path.resolve(options.cwd), '.gitignore')}"))`,
      `(deny file-write* (literal "${path.join(path.resolve(options.cwd), '.geminiignore')}"))`,
      `(deny file-write* (literal "${path.join(path.resolve(options.cwd), '.env')}"))`,
      
      // OPTIONAL: If you want to hide these files completely (prevent reading), 
      // uncomment the lines below. Note: this will break 'git status'.
      // `(deny file-read* (literal "${path.join(path.resolve(options.cwd), '.gitignore')}"))`,
      // `(deny file-read* (literal "${path.join(path.resolve(options.cwd), '.geminiignore')}"))`,

      // Metadata access
      '(allow file-read-metadata)',
      
      // Ephemeral Rules
      ...(options.ephemeralRules || []),
    ];

    return rules.join('\n');
  }
}
