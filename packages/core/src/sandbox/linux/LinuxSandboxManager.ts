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
  GOVERNANCE_FILES,
  sanitizePaths,
  tryRealpath,
} from '../../services/sandboxManager.js';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
} from '../../services/environmentSanitization.js';
import { isNodeError } from '../../utils/errors.js';

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

  const bpfPath = join(os.tmpdir(), `gemini-cli-seccomp-${process.pid}.bpf`);
  fs.writeFileSync(bpfPath, buf);
  cachedBpfPath = bpfPath;
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
export class LinuxSandboxManager implements SandboxManager {
  constructor(private readonly options: GlobalSandboxOptions) {}

  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    const sanitizationConfig = getSecureSanitizationConfig(
      req.policy?.sanitizationConfig,
    );

    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    const bwrapArgs: string[] = [
      ...(req.policy?.networkAccess
        ? [
            '--unshare-user',
            '--unshare-ipc',
            '--unshare-pid',
            '--unshare-uts',
            '--unshare-cgroup',
          ]
        : ['--unshare-all']),
      '--new-session', // Isolate session
      '--die-with-parent', // Prevent orphaned runaway processes
      '--ro-bind',
      '/',
      '/',
      '--dev', // Creates a safe, minimal /dev (replaces --dev-bind)
      '/dev',
      '--proc', // Creates a fresh procfs for the unshared PID namespace
      '/proc',
      '--tmpfs', // Provides an isolated, writable /tmp directory
      '/tmp',
      // Note: --dev /dev sets up /dev/pts automatically
      '--bind',
      this.options.workspace,
      this.options.workspace,
    ];

    // Protected governance files are bind-mounted as read-only, even if the workspace is RW.
    // We ensure they exist on the host and resolve real paths to prevent symlink bypasses.
    // In bwrap, later binds override earlier ones for the same path.
    for (const file of GOVERNANCE_FILES) {
      const filePath = join(this.options.workspace, file.path);
      touch(filePath, file.isDirectory);

      const realPath = fs.realpathSync(filePath);

      bwrapArgs.push('--ro-bind', filePath, filePath);
      if (realPath !== filePath) {
        bwrapArgs.push('--ro-bind', realPath, realPath);
      }
    }

    const allowedPaths = sanitizePaths(req.policy?.allowedPaths) || [];
    const normalizedWorkspace = this.normalizePath(this.options.workspace);
    for (const p of allowedPaths) {
      if (this.normalizePath(p) !== normalizedWorkspace) {
        bwrapArgs.push('--bind-try', p, p);
      }
    }

    const forbiddenPaths = sanitizePaths(req.policy?.forbiddenPaths) || [];
    for (const p of forbiddenPaths) {
      try {
        const originalPath = this.normalizePath(p);
        const resolvedPath = await tryRealpath(originalPath);

        // Mask the resolved path to prevent access to the underlying file.
        await this.applyMasking(bwrapArgs, resolvedPath);

        // If the original path was a symlink, mask it as well to prevent access
        // through the link itself.
        if (resolvedPath !== originalPath) {
          await this.applyMasking(bwrapArgs, originalPath);
        }
      } catch (e) {
        throw new Error(
          `Failed to deny access to forbidden path: ${p}. ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

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
    };
  }

  /**
   * Applies bubblewrap arguments to mask a forbidden path.
   */
  private async applyMasking(args: string[], path: string) {
    try {
      const stats = await fs.promises.stat(path);

      if (stats.isDirectory()) {
        // Directories are masked by mounting an empty, read-only tmpfs.
        args.push('--tmpfs', path, '--remount-ro', path);
      } else {
        // Existing files are masked by binding them to /dev/null.
        args.push('--ro-bind-try', '/dev/null', path);
      }
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') {
        // Non-existent paths are masked by a broken symlink. This prevents
        // creation within the sandbox while avoiding host remnants.
        args.push('--symlink', '/.forbidden', path);
        return;
      }
      throw e;
    }
  }

  private normalizePath(p: string): string {
    return normalize(p).replace(/\/$/, '');
  }
}
