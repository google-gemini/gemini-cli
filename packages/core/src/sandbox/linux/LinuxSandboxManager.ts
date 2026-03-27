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
import { type SandboxPolicyManager } from '../../policy/sandboxPolicyManager.js';
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

let cachedBpfPath: string | undefined;

function getSeccompBpfPath(): string {
  if (cachedBpfPath) return cachedBpfPath;

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

  const tempDir = fs.mkdtempSync(join(os.tmpdir(), 'gemini-cli-seccomp-'));
  const bpfPath = join(tempDir, 'seccomp.bpf');
  fs.writeFileSync(bpfPath, buf);
  cachedBpfPath = bpfPath;

  // Cleanup on exit
  process.on('exit', () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  return bpfPath;
}

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

export interface LinuxSandboxOptions extends GlobalSandboxOptions {
  modeConfig?: {
    readonly?: boolean;
    network?: boolean;
    approvedTools?: string[];
    allowOverrides?: boolean;
  };
  policyManager?: SandboxPolicyManager;
}

export class LinuxSandboxManager implements SandboxManager {
  private static maskFilePath: string | undefined;

  constructor(private readonly options: LinuxSandboxOptions) {}

  isKnownSafeCommand(args: string[]): boolean {
    return isKnownSafeCommand(args);
  }

  isDangerousCommand(args: string[]): boolean {
    return isDangerousCommand(args);
  }

  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return parsePosixSandboxDenials(result);
  }

  private getMaskFilePath(): string {
    if (
      LinuxSandboxManager.maskFilePath &&
      fs.existsSync(LinuxSandboxManager.maskFilePath)
    ) {
      return LinuxSandboxManager.maskFilePath;
    }
    const tempDir = fs.mkdtempSync(join(os.tmpdir(), 'gemini-cli-mask-file-'));
    const maskPath = join(tempDir, 'mask');
    fs.writeFileSync(maskPath, '');
    fs.chmodSync(maskPath, 0);
    LinuxSandboxManager.maskFilePath = maskPath;

    // Cleanup on exit
    process.on('exit', () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore errors
      }
    });

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
      this.options.modeConfig?.network ?? req.policy?.networkAccess ?? false;

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

    const forbiddenPaths = sanitizePaths(req.policy?.forbiddenPaths) || [];
    for (const p of forbiddenPaths) {
      let resolved: string;
      try {
        resolved = tryRealpath(p); // Forbidden paths should still resolve to block the real path
        if (!fs.existsSync(resolved)) continue;
      } catch (e: unknown) {
        debugLogger.warn(
          `Failed to resolve forbidden path ${p}: ${e instanceof Error ? e.message : String(e)}`,
        );
        bwrapArgs.push('--ro-bind', '/dev/null', p);
        continue;
      }
      try {
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          bwrapArgs.push('--tmpfs', resolved, '--remount-ro', resolved);
        } else {
          bwrapArgs.push('--ro-bind', '/dev/null', resolved);
        }
      } catch (e: unknown) {
        if (isErrnoException(e) && e.code === 'ENOENT') {
          bwrapArgs.push('--symlink', '/dev/null', resolved);
        } else {
          debugLogger.warn(
            `Failed to stat forbidden path ${resolved}: ${e instanceof Error ? e.message : String(e)}`,
          );
          bwrapArgs.push('--ro-bind', '/dev/null', resolved);
        }
      }
    }

    // Mask secret files (.env, .env.*)
    bwrapArgs.push(
      ...(await this.getSecretFilesArgs(req.policy?.allowedPaths)),
    );

    const bpfPath = getSeccompBpfPath();

    bwrapArgs.push('--seccomp', '9');
    bwrapArgs.push('--', req.command, ...req.args);

    const shArgs = [
      '-c',
      'bpf_path="$1"; shift; exec bwrap "$@" 9< "$bpf_path"',
      '_',
      bpfPath,
      ...bwrapArgs,
    ];

    return {
      program: 'sh',
      args: shArgs,
      env: sanitizedEnv,
      cwd: req.cwd,
    };
  }

  /**
   * Generates bubblewrap arguments to mask secret files.
   */
  private async getSecretFilesArgs(allowedPaths?: string[]): Promise<string[]> {
    const args: string[] = [];
    const maskPath = this.getMaskFilePath();
    const paths = sanitizePaths(allowedPaths) || [];
    const searchDirs = new Set([this.options.workspace, ...paths]);
    const findPatterns = getSecretFileFindArgs();

    for (const dir of searchDirs) {
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
            args.push('--bind', maskPath, file.trim());
          }
        }
      } catch (e) {
        debugLogger.log(
          `LinuxSandboxManager: Failed to find or mask secret files in ${dir}`,
          e,
        );
      }
    }
    return args;
  }
}
