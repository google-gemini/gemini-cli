/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { posix as path } from 'node:path';
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
 * A SandboxManager implementation for Linux that uses Bubblewrap (bwrap).
 */
export class LinuxSandboxManager implements SandboxManager {
  private static maskFilePath: string | undefined;

  constructor(private readonly options: GlobalSandboxOptions) {}

  isKnownSafeCommand(args: string[]): boolean {
    return isKnownSafeCommand(args);
  }

  isDangerousCommand(args: string[]): boolean {
    return isDangerousCommand(args);
  }

  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return parsePosixSandboxDenials(result);
  }

  /**
   * Converts a path to a POSIX path and strips drive letters (Windows).
   */
  private toPosixPath(p: string): string {
    return p.replace(/^[a-zA-Z]:/, '').replace(/\\/g, '/');
  }

  private async getMaskFilePath(): Promise<{
    maskPath: string;
    cleanup: () => void;
  }> {
    if (
      LinuxSandboxManager.maskFilePath &&
      (await fs.promises
        .stat(LinuxSandboxManager.maskFilePath)
        .then(() => true)
        .catch(() => false))
    ) {
      return { maskPath: LinuxSandboxManager.maskFilePath, cleanup: () => {} };
    }
    const tempDir = await fs.promises.mkdtemp(
      path.join(this.toPosixPath(os.tmpdir()), 'gemini-cli-mask-file-'),
    );
    const maskPath = path.join(tempDir, 'mask');
    await fs.promises.writeFile(maskPath, '');
    await fs.promises.chmod(maskPath, 0);
    LinuxSandboxManager.maskFilePath = maskPath;

    const cleanup = () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore errors
      }
    };

    return { maskPath, cleanup };
  }

  private async getSeccompBpfPath(): Promise<{
    bpfPath: string;
    cleanup: () => void;
  }> {
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

    const buf = Buffer.allocUnsafe(8 * instructions.length);
    for (let i = 0; i < instructions.length; i++) {
      const inst = instructions[i];
      const offset = i * 8;
      buf.writeUInt16LE(inst.code, offset);
      buf.writeUInt8(inst.jt, offset + 2);
      buf.writeUInt8(inst.jf, offset + 3);
      buf.writeUInt32LE(inst.k, offset + 4);
    }

    const tempDir = await fs.promises.mkdtemp(
      path.join(this.toPosixPath(os.tmpdir()), 'gemini-cli-seccomp-'),
    );
    const bpfPath = path.join(tempDir, 'seccomp.bpf');
    await fs.promises.writeFile(bpfPath, buf);

    const cleanup = () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    };

    return { bpfPath, cleanup };
  }

  /**
   * Ensures a file or directory exists.
   */
  private async touch(filePath: string, isDirectory: boolean) {
    try {
      // If it exists (even as a broken symlink), do nothing
      await fs.promises.lstat(filePath);
      return;
    } catch {
      // Ignore ENOENT
    }

    if (isDirectory) {
      await fs.promises.mkdir(filePath, { recursive: true });
    } else {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      const handle = await fs.promises.open(filePath, 'a');
      await handle.close();
    }
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

    // Ensure we don't leak D-Bus or other session-sensitive variables that could facilitate sandbox escapes.
    if (sanitizedEnv['DBUS_SESSION_BUS_ADDRESS']) {
      sanitizedEnv['DBUS_SESSION_BUS_ADDRESS'] = '';
    }

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
      '--tmpfs', // Isolate /dev/shm to prevent shared memory leaks
      '/dev/shm',
      '--tmpfs', // Isolate /run/user/ID if it exists in the environment
      '/run',
    );

    const workspacePath = this.toPosixPath(tryRealpath(this.options.workspace));
    const workspaceArg = this.toPosixPath(this.options.workspace);

    const bindFlag = workspaceWrite ? '--bind-try' : '--ro-bind-try';

    if (workspaceWrite) {
      bwrapArgs.push('--bind-try', workspaceArg, workspaceArg);
      if (workspacePath !== workspaceArg) {
        bwrapArgs.push('--bind-try', workspacePath, workspacePath);
      }
    } else {
      bwrapArgs.push('--ro-bind-try', workspaceArg, workspaceArg);
      if (workspacePath !== workspaceArg) {
        bwrapArgs.push('--ro-bind-try', workspacePath, workspacePath);
      }
    }

    let { worktreeGitDir, mainGitDir } = resolveGitWorktreePaths(workspacePath);
    if (worktreeGitDir) {
      worktreeGitDir = this.toPosixPath(worktreeGitDir);
      bwrapArgs.push(bindFlag, worktreeGitDir, worktreeGitDir);
    }
    if (mainGitDir) {
      mainGitDir = this.toPosixPath(mainGitDir);
      bwrapArgs.push(bindFlag, mainGitDir, mainGitDir);
    }

    const allowedPaths = sanitizePaths(req.policy?.allowedPaths) || [];
    const normalizedWorkspace = path
      .normalize(workspacePath)
      .replace(/\/$/, '');
    for (const allowedPath of allowedPaths) {
      const resolved = this.toPosixPath(tryRealpath(allowedPath));
      if (!fs.existsSync(resolved)) continue;
      const normalizedAllowedPath = path.normalize(resolved).replace(/\/$/, '');
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
        const safeResolvedPath = this.toPosixPath(tryRealpath(p));
        bwrapArgs.push('--ro-bind-try', safeResolvedPath, safeResolvedPath);
      } catch (e: unknown) {
        debugLogger.warn(e instanceof Error ? e.message : String(e));
      }
    }

    const additionalWrites =
      sanitizePaths(mergedAdditional.fileSystem?.write) || [];
    for (const p of additionalWrites) {
      try {
        const safeResolvedPath = this.toPosixPath(tryRealpath(p));
        bwrapArgs.push('--bind-try', safeResolvedPath, safeResolvedPath);
      } catch (e: unknown) {
        debugLogger.warn(e instanceof Error ? e.message : String(e));
      }
    }

    for (const file of GOVERNANCE_FILES) {
      const filePath = this.toPosixPath(
        path.join(this.options.workspace, file.path),
      );
      await this.touch(filePath, file.isDirectory);
      const realPath = this.toPosixPath(tryRealpath(filePath));
      bwrapArgs.push('--ro-bind', filePath, filePath);
      if (realPath !== filePath) {
        bwrapArgs.push('--ro-bind', realPath, realPath);
      }
    }

    const forbiddenPaths = new Set([
      ...(sanitizePaths(req.policy?.forbiddenPaths) || []),
      ...(sanitizePaths(this.options.forbiddenPaths) || []),
    ]);
    for (const p of forbiddenPaths) {
      try {
        const resolved = tryRealpath(p);
        const posixP = this.toPosixPath(resolved);
        const stats = await fs.promises.stat(resolved);
        if (stats.isDirectory()) {
          bwrapArgs.push('--tmpfs', posixP);
        } else {
          bwrapArgs.push('--ro-bind', '/dev/null', posixP);
        }
      } catch (e: unknown) {
        const posixP = this.toPosixPath(p);
        if (isErrnoException(e) && e.code === 'ENOENT') {
          bwrapArgs.push('--symlink', '/dev/null', posixP);
        } else {
          debugLogger.warn(
            `Failed to stat forbidden path ${p}: ${e instanceof Error ? e.message : String(e)}`,
          );
          bwrapArgs.push('--ro-bind', '/dev/null', posixP);
        }
      }
    }

    // Mask secret files (.env, .env.*)
    const { args: secretArgs, cleanup: secretCleanup } =
      await this.getSecretFilesArgs(req.policy?.allowedPaths);
    bwrapArgs.push(...secretArgs);

    const { bpfPath, cleanup: bpfCleanup } = await this.getSeccompBpfPath();

    bwrapArgs.push('--seccomp', '9');
    bwrapArgs.push('--', req.command, ...req.args);

    const shArgs = [
      '-c',
      'bpf_path="$1"; shift; exec bwrap "$@" 9< "$bpf_path"',
      '_',
      bpfPath,
      ...bwrapArgs,
    ];

    const cleanup = () => {
      secretCleanup();
      bpfCleanup();
    };

    return {
      program: 'sh',
      args: shArgs,
      env: sanitizedEnv,
      cwd: req.cwd,
      cleanup,
    };
  }

  /**
   * Generates bubblewrap arguments to mask secret files.
   */
  private async getSecretFilesArgs(allowedPaths?: string[]): Promise<{
    args: string[];
    cleanup: () => void;
  }> {
    const args: string[] = [];
    const { maskPath, cleanup } = await this.getMaskFilePath();
    const posixMaskPath = this.toPosixPath(maskPath);
    const paths = sanitizePaths(allowedPaths) || [];
    const searchDirs = new Set([this.options.workspace, ...paths]);
    const findPatterns = getSecretFileFindArgs();

    for (const dir of searchDirs) {
      try {
        const posixDir = this.toPosixPath(dir);
        // Use the native 'find' command for performance and to catch nested secrets.
        // We limit depth to 3 to keep it fast while covering common nested structures.
        // We use -prune to skip heavy directories efficiently while matching dotfiles.
        const findResult = await spawnAsync('find', [
          posixDir,
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

        const files: string[] = findResult.stdout.toString().split('\0');
        for (const file of files) {
          if (file.trim()) {
            const posixFile = this.toPosixPath(file.trim());
            args.push('--bind', posixMaskPath, posixFile);
          }
        }
      } catch (e: unknown) {
        debugLogger.log(
          `LinuxSandboxManager: Failed to find or mask secret files in ${dir}`,
          e instanceof Error ? e : String(e),
        );
      }
    }
    return { args, cleanup };
  }
}
