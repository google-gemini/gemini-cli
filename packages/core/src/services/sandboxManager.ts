/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
        
        // Auto-detect Git Worktree metadata paths
        try {
          const gitDotPath = path.join(options.cwd, '.git');
          if (fs.existsSync(gitDotPath)) {
            const stat = fs.lstatSync(gitDotPath);
            if (stat.isFile()) {
              // It's a worktree link (contains "gitdir: /path/to/repo/.git/worktrees/name")
              const content = fs.readFileSync(gitDotPath, 'utf8').trim();
              const match = content.match(/^gitdir:\s*(.+)$/);
              if (match?.[1]) {
                const gitDir = path.resolve(options.cwd, match[1]);
                allowedPaths.push(gitDir);
                // Also allow the parent .git dir which often contains shared config/hooks
                allowedPaths.push(path.dirname(gitDir));
                // And the main repo root if possible
                allowedPaths.push(path.dirname(path.dirname(gitDir)));
              }
            } else if (stat.isDirectory()) {
              allowedPaths.push(gitDotPath);
            }
          }
        } catch (e) {
          debugLogger.debug('Failed to auto-detect git metadata paths:', e);
        }

        fs.writeFileSync(
          profilePath,
          this.generateSeatbeltProfile(optionsWithProfile, allowedPaths),
        );

        return {
          program: '/usr/bin/sandbox-exec',
          args: ['-f', profilePath, options.command, ...options.args],
          cleanup: () => {
            // Temporarily disabled cleanup for debugging
            console.error(`[DEBUG] Sandbox profile kept at: ${profilePath}`);
            /*
            try {
              fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (error) {
              debugLogger.error('macOS Sandbox cleanup failed:', error);
            }
            */
          },
        };
      } catch (error) {
        // Log failure but fallback to original command to ensure execution.
        debugLogger.error('macOS Sandbox setup failed:', error);
      }
    }

    // TODO: Support bwrap (Linux) and Restricted Tokens (Windows).
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

      // Git and User Config (Read-only)
      `(allow file-read* (literal "${path.join(os.homedir(), '.gitconfig')}"))`,
      `(allow file-read* (subpath "${path.join(os.homedir(), '.config/git')}"))`,
      ...(process.env['SSH_AUTH_SOCK'] ? [`(allow file-read* file-write* (literal "${process.env['SSH_AUTH_SOCK']}"))`] : []),

      // Project Workspace and Temp
      `(allow ${workspacePermission} (subpath "${path.resolve(options.cwd)}"))`,
      ...allowedPaths.map(p => `(allow ${workspacePermission} (subpath "${path.resolve(p)}"))`),
      '(allow file-read* file-write* (subpath "/private/tmp"))',
      '(allow file-read* file-write* (subpath "/tmp"))',
      '(allow file-read* file-write* (subpath "/var/tmp"))',
      '(allow file-read* file-write* (subpath "/private/var/folders"))',

      // Metadata access
      '(allow file-read-metadata)',
    ];

    return rules.join('\n');
  }
}
