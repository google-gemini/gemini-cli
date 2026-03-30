/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import os from 'node:os';
import {
  type SandboxManager,
  type GlobalSandboxOptions,
  type SandboxRequest,
  type SandboxedCommand,
  type SandboxPermissions,
  GOVERNANCE_FILES,
  getSecretFileFindArgs,
  sanitizePaths,
  type ParsedSandboxDenial,
} from '../../services/sandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
} from '../../services/environmentSanitization.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { spawnAsync } from '../../utils/shell-utils.js';
import {
  isStrictlyApproved,
  verifySandboxOverrides,
  getCommandName,
} from '../utils/commandUtils.js';
import {
  tryRealpath,
  resolveGitWorktreePaths,
  isErrnoException,
} from '../utils/fsUtils.js';
import {
  isKnownSafeCommand,
  isDangerousCommand,
} from '../utils/commandSafety.js';
import { parsePosixSandboxDenials } from '../utils/sandboxDenialUtils.js';

/**
 * Ensures a file or directory exists.
 */
function touch(filePath: string, isDirectory: boolean) {
  try {
    // If it exists (even as a broken symlink), do nothing
    if (fs.lstatSync(filePath)) return;
  } catch {
    // Ignore ENOENT
  }

  if (isDirectory) {
    fs.mkdirSync(filePath, { recursive: true });
  } else {
    fs.mkdirSync(dirname(filePath), { recursive: true });
    fs.closeSync(fs.openSync(filePath, 'a'));
  }
}

/**
 * A SandboxManager implementation for Linux that uses Bubblewrap (bwrap).
 */

export class LinuxSandboxManager implements SandboxManager {
  /** Secure directory for sandbox configuration and argument payloads. */
  private sandboxConfigDir?: string;
  /** Compiled seccomp BPF filter to restrict dangerous system calls. */
  private seccompFilterPath?: string;
  /** A 000-permission empty file used to mask secret files inside the sandbox. */
  private secretMaskPath?: string;
  private readonly exitCleanupHandler: () => void;

  constructor(private readonly options: GlobalSandboxOptions) {
    this.exitCleanupHandler = () => {
      this.cleanup();
    };
  }

  isKnownSafeCommand(args: string[]): boolean {
    return isKnownSafeCommand(args);
  }

  isDangerousCommand(args: string[]): boolean {
    return isDangerousCommand(args);
  }

  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return parsePosixSandboxDenials(result);
  }

  private getSandboxConfigDir(): string {
    if (!this.sandboxConfigDir) {
      this.sandboxConfigDir = fs.mkdtempSync(
        join(os.tmpdir(), 'gemini-cli-linux-sandbox-'),
      );
      process.on('exit', this.exitCleanupHandler);
    }
    return this.sandboxConfigDir;
  }

  private getSeccompFilterPath(): string {
    if (this.seccompFilterPath) return this.seccompFilterPath;

    const arch = os.arch();
    let AUDIT_ARCH: number;
    let SYS_ptrace: number;

    if (arch === 'x64') {
      AUDIT_ARCH = 0xc000003e; // AUDIT_ARCH_X86_64
      SYS_ptrace = 101;
    } else if (arch === 'arm64') {
      AUDIT_ARCH = 0xc00000b7; // AUDIT_ARCH_AARCH64
      SYS_ptrace = 117;
    } else if (arch === 'arm') {
      AUDIT_ARCH = 0x40000028; // AUDIT_ARCH_ARM
      SYS_ptrace = 26;
    } else if (arch === 'ia32') {
      AUDIT_ARCH = 0x40000003; // AUDIT_ARCH_I386
      SYS_ptrace = 26;
    } else {
      throw new Error(`Unsupported architecture for seccomp filter: ${arch}`);
    }

    const EPERM = 1;
    const SECCOMP_RET_KILL_PROCESS = 0x80000000;
    const SECCOMP_RET_ERRNO = 0x00050000;
    const SECCOMP_RET_ALLOW = 0x7fff0000;

    const instructions = [
      { code: 0x20, jt: 0, jf: 0, k: 4 }, // Load arch
      { code: 0x15, jt: 1, jf: 0, k: AUDIT_ARCH }, // Jump to kill if arch != native arch
      { code: 0x06, jt: 0, jf: 0, k: SECCOMP_RET_KILL_PROCESS }, // Kill

      { code: 0x20, jt: 0, jf: 0, k: 0 }, // Load nr
      { code: 0x15, jt: 0, jf: 1, k: SYS_ptrace }, // If ptrace, jump to ERRNO
      { code: 0x06, jt: 0, jf: 0, k: SECCOMP_RET_ERRNO | EPERM }, // ERRNO

      { code: 0x06, jt: 0, jf: 0, k: SECCOMP_RET_ALLOW }, // Allow
    ];

    const buf = Buffer.alloc(8 * instructions.length);
    for (let i = 0; i < instructions.length; i++) {
      const inst = instructions[i];
      const offset = i * 8;
      buf.writeUInt16LE(inst.code, offset);
      buf.writeUInt8(inst.jt, offset + 2);
      buf.writeUInt8(inst.jf, offset + 3);
      buf.writeUInt32LE(inst.k, offset + 4);
    }

    const tempDir = this.getSandboxConfigDir();
    const bpfPath = join(tempDir, 'seccomp.bpf');
    fs.writeFileSync(bpfPath, buf);
    this.seccompFilterPath = bpfPath;

    return bpfPath;
  }

  private getSecretMaskPath(): string {
    if (this.secretMaskPath && fs.existsSync(this.secretMaskPath)) {
      return this.secretMaskPath;
    }
    const tempDir = this.getSandboxConfigDir();
    const maskPath = join(tempDir, 'mask');
    fs.writeFileSync(maskPath, '');
    fs.chmodSync(maskPath, 0);
    this.secretMaskPath = maskPath;

    return maskPath;
  }

  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    const isReadonlyMode = this.options.modeConfig?.readonly ?? true;
    const allowOverrides = this.options.modeConfig?.allowOverrides ?? true;

    verifySandboxOverrides(allowOverrides, req.policy);

    const commandName = await getCommandName(req);
    const isApproved = allowOverrides
      ? await isStrictlyApproved(req, this.options.modeConfig?.approvedTools)
      : false;
    const workspaceWrite = !isReadonlyMode || isApproved;
    const networkAccess =
      this.options.modeConfig?.network || req.policy?.networkAccess || false;

    const persistentPermissions = allowOverrides
      ? this.options.policyManager?.getCommandPermissions(commandName)
      : undefined;

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
        networkAccess ||
        persistentPermissions?.network ||
        req.policy?.additionalPermissions?.network ||
        false,
    };

    const sanitizationConfig = getSecureSanitizationConfig(
      req.policy?.sanitizationConfig,
    );

    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    const bwrapArgs: string[] = [
      '--unshare-all',
      '--new-session', // Isolate session
      '--die-with-parent', // Prevent orphaned runaway processes
    ];

    if (mergedAdditional.network) {
      bwrapArgs.push('--share-net');
    }

    bwrapArgs.push(
      '--ro-bind',
      '/',
      '/',
      '--dev', // Creates a safe, minimal /dev (replaces --dev-bind)
      '/dev',
      '--proc', // Creates a fresh procfs for the unshared PID namespace
      '/proc',
      '--tmpfs', // Provides an isolated, writable /tmp directory
      '/tmp',
    );

    const workspacePath = tryRealpath(this.options.workspace);

    const bindFlag = workspaceWrite ? '--bind-try' : '--ro-bind-try';

    if (workspaceWrite) {
      bwrapArgs.push(
        '--bind-try',
        this.options.workspace,
        this.options.workspace,
      );
      if (workspacePath !== this.options.workspace) {
        bwrapArgs.push('--bind-try', workspacePath, workspacePath);
      }
    } else {
      bwrapArgs.push(
        '--ro-bind-try',
        this.options.workspace,
        this.options.workspace,
      );
      if (workspacePath !== this.options.workspace) {
        bwrapArgs.push('--ro-bind-try', workspacePath, workspacePath);
      }
    }

    const { worktreeGitDir, mainGitDir } =
      resolveGitWorktreePaths(workspacePath);
    if (worktreeGitDir) {
      bwrapArgs.push(bindFlag, worktreeGitDir, worktreeGitDir);
    }
    if (mainGitDir) {
      bwrapArgs.push(bindFlag, mainGitDir, mainGitDir);
    }

    const allowedPaths = sanitizePaths(req.policy?.allowedPaths) || [];
    const normalizedWorkspace = normalize(workspacePath).replace(/\/$/, '');
    for (const allowedPath of allowedPaths) {
      const resolved = tryRealpath(allowedPath);
      if (!fs.existsSync(resolved)) continue;
      const normalizedAllowedPath = normalize(resolved).replace(/\/$/, '');
      if (normalizedAllowedPath !== normalizedWorkspace) {
        if (
          !workspaceWrite &&
          normalizedAllowedPath.startsWith(normalizedWorkspace + '/')
        ) {
          bwrapArgs.push('--ro-bind-try', resolved, resolved);
        } else {
          bwrapArgs.push('--bind-try', resolved, resolved);
        }
      }
    }

    const additionalReads =
      sanitizePaths(mergedAdditional.fileSystem?.read) || [];
    for (const p of additionalReads) {
      try {
        const safeResolvedPath = tryRealpath(p);
        bwrapArgs.push('--ro-bind-try', safeResolvedPath, safeResolvedPath);
      } catch (e: unknown) {
        debugLogger.warn(e instanceof Error ? e.message : String(e));
      }
    }

    const additionalWrites =
      sanitizePaths(mergedAdditional.fileSystem?.write) || [];
    for (const p of additionalWrites) {
      try {
        const safeResolvedPath = tryRealpath(p);
        bwrapArgs.push('--bind-try', safeResolvedPath, safeResolvedPath);
      } catch (e: unknown) {
        debugLogger.warn(e instanceof Error ? e.message : String(e));
      }
    }

    for (const file of GOVERNANCE_FILES) {
      const filePath = join(this.options.workspace, file.path);
      touch(filePath, file.isDirectory);
      const realPath = tryRealpath(filePath);
      bwrapArgs.push('--ro-bind', filePath, filePath);
      if (realPath !== filePath) {
        bwrapArgs.push('--ro-bind', realPath, realPath);
      }
    }

    const forbiddenPaths = sanitizePaths(this.options.forbiddenPaths) || [];
    const forbiddenArgsArrays = await Promise.all(
      forbiddenPaths.map(async (p) => {
        const localArgs: string[] = [];
        let resolved: string;
        try {
          resolved = tryRealpath(p); // Forbidden paths should still resolve to block the real path
          if (!fs.existsSync(resolved)) return localArgs;
        } catch (e: unknown) {
          debugLogger.warn(
            `Failed to resolve forbidden path ${p}: ${e instanceof Error ? e.message : String(e)}`,
          );
          localArgs.push('--ro-bind', '/dev/null', p);
          return localArgs;
        }
        try {
          const stat = await fs.promises.stat(resolved);
          if (stat.isDirectory()) {
            localArgs.push('--tmpfs', resolved, '--remount-ro', resolved);
          } else {
            localArgs.push('--ro-bind', '/dev/null', resolved);
          }
        } catch (e: unknown) {
          if (isErrnoException(e) && e.code === 'ENOENT') {
            localArgs.push('--symlink', '/dev/null', resolved);
          } else {
            debugLogger.warn(
              `Failed to stat forbidden path ${resolved}: ${e instanceof Error ? e.message : String(e)}`,
            );
            localArgs.push('--ro-bind', '/dev/null', resolved);
          }
        }
        return localArgs;
      }),
    );
    bwrapArgs.push(...forbiddenArgsArrays.flat());

    // Mask secret files (.env, .env.*)
    bwrapArgs.push(
      ...(await this.getSecretFilesArgs(req.policy?.allowedPaths)),
    );

    const bpfPath = this.getSeccompFilterPath();

    bwrapArgs.push('--seccomp', '9');

    // Batch all arguments including the command and its args into a null-separated
    // payload file. This avoids the Linux ARG_MAX (E2BIG) limit when passing
    // thousands of bind arguments.
    bwrapArgs.push('--', req.command, ...req.args);

    const tempDir = this.getSandboxConfigDir();
    const argsPath = join(
      tempDir,
      `args-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
    );

    // Write the null-separated arguments to the file
    fs.writeFileSync(argsPath, bwrapArgs.join('\0'));

    const shArgs = [
      '-c',
      'bpf_path="$1"; args_path="$2"; exec bwrap --args 10 9< "$bpf_path" 10< "$args_path"',
      '_',
      bpfPath,
      argsPath,
    ];

    return {
      program: 'sh',
      args: shArgs,
      env: sanitizedEnv,
      cwd: req.cwd,
    };
  }

  /**
   * Generates bubblewrap arguments to mask secret files in parallel.
   */
  private async getSecretFilesArgs(allowedPaths?: string[]): Promise<string[]> {
    const maskPath = this.getSecretMaskPath();
    const paths = sanitizePaths(allowedPaths) || [];
    const searchDirs = new Set([this.options.workspace, ...paths]);
    const findPatterns = getSecretFileFindArgs();

    const results = await Promise.all(
      Array.from(searchDirs).map(async (dir) => {
        const localArgs: string[] = [];
        try {
          // Use the native 'find' command for performance and to catch nested secrets.
          // We limit depth to 3 to keep it fast while covering common nested structures.
          // We use -prune to skip heavy directories efficiently while matching dotfiles.
          const findResult = await spawnAsync('find', [
            dir,
            '-maxdepth',
            '3',
            '-type',
            'd',
            '(',
            '-name',
            '.git',
            '-o',
            '-name',
            'node_modules',
            '-o',
            '-name',
            '.venv',
            '-o',
            '-name',
            '__pycache__',
            '-o',
            '-name',
            'dist',
            '-o',
            '-name',
            'build',
            ')',
            '-prune',
            '-o',
            '-type',
            'f',
            ...findPatterns,
            '-print0',
          ]);

          const files = findResult.stdout.toString().split('\0');
          for (const file of files) {
            if (file.trim()) {
              localArgs.push('--bind', maskPath, file.trim());
            }
          }
        } catch (e) {
          debugLogger.log(
            `LinuxSandboxManager: Failed to find or mask secret files in ${dir}`,
            e,
          );
        }
        return localArgs;
      }),
    );

    return results.flat();
  }

  /**
   * Cleans up temporary resources associated with this sandbox manager instance.
   */
  cleanup(): void {
    if (this.sandboxConfigDir) {
      try {
        fs.rmSync(this.sandboxConfigDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      this.sandboxConfigDir = undefined;
      this.seccompFilterPath = undefined;
      this.secretMaskPath = undefined;
    }
    process.removeListener('exit', this.exitCleanupHandler);
  }
}
