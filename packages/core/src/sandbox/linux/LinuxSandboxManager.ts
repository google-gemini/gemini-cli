/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import {
  type SandboxRequest,
  type SandboxedCommand,
  type SandboxPermissions,
  type ParsedSandboxDenial,
} from '../../services/sandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import {
  isKnownSafeCommand as isPosixSafeCommand,
  isDangerousCommand as isPosixDangerousCommand,
} from '../utils/commandSafety.js';
import { ensureGovernanceFilesExist } from '../utils/governanceUtils.js';
import { parsePosixSandboxDenials } from '../utils/sandboxDenialUtils.js';
import { handleReadWriteCommands } from '../utils/sandboxReadWriteUtils.js';
import { buildBwrapArgs } from './bwrapArgsBuilder.js';
import {
  AbstractOsSandboxManager,
  type PreparedExecutionDetails,
} from '../abstractOsSandboxManager.js';
import { isStrictlyApproved } from '../utils/commandUtils.js';

/**
 * A SandboxManager implementation for Linux that uses Bubblewrap (bwrap).
 */

export class LinuxSandboxManager extends AbstractOsSandboxManager {
  private cachedBpfPath: string | undefined;
  private maskFilePath: string | undefined;

  protected override async initialize(): Promise<void> {
    // Default no-op
  }

  private getSeccompBpfPath(): string {
    if (this.cachedBpfPath) return this.cachedBpfPath;

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
    this.cachedBpfPath = bpfPath;

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

  protected override ensureGovernanceFilesExist(workspace: string): void {
    if (this.governanceFilesInitialized) return;
    ensureGovernanceFilesExist(workspace);
    this.governanceFilesInitialized = true;
  }

  /**
   * Virtual commands like __read and __write must be mapped to native POSIX tools
   * so that Bubblewrap can enforce file access policies on real executables.
   */
  protected override mapVirtualCommandToNative(
    command: string,
    args: string[],
  ): { command: string; args: string[] } {
    if (command === '__read') {
      return { command: 'cat', args };
    }
    if (command === '__write') {
      return { command: 'sh', args: ['-c', 'cat > "$1"', '_', ...args] };
    }
    return { command, args };
  }

  /**
   * Linux permissions are entirely driven by Bubblewrap bind mounts and seccomp filters
   * resolved from paths later in the flow. No intermediate tweaking is needed here.
   */
  protected override updateReadWritePermissions(
    _permissions: SandboxPermissions,
    _req: SandboxRequest,
  ): void {
    // Default no-op
  }

  /**
   * Ensures read/write commands strictly respect allowed paths and workspace boundaries
   * before the final sandbox invocation is constructed.
   */
  protected override rewriteReadWriteCommand(
    req: SandboxRequest,
    command: string,
    args: string[],
    permissions: SandboxPermissions,
  ): { command: string; args: string[] } {
    return handleReadWriteCommands(req, permissions, this.options.workspace, [
      ...(req.policy?.allowedPaths || []),
      ...(this.options.includeDirectories || []),
    ]);
  }

  protected async buildSandboxedCommand(
    details: PreparedExecutionDetails,
  ): Promise<SandboxedCommand> {
    const {
      finalCommand,
      finalArgs,
      sanitizedEnv,
      resolvedPaths,
      workspaceWrite,
      networkAccess,
      req,
    } = details;

    const bwrapArgs = await buildBwrapArgs({
      resolvedPaths,
      workspaceWrite,
      networkAccess,
      maskFilePath: this.getMaskFilePath(),
      isReadOnlyCommand: req.command === '__read',
    });

    const bpfPath = this.getSeccompBpfPath();
    bwrapArgs.push('--seccomp', '9');

    const argsPath = this.writeArgsToTempFile(bwrapArgs);

    const shArgs = [
      '-c',
      'bpf_path="$1"; args_path="$2"; shift 2; exec bwrap --args 8 "$@" 8< "$args_path" 9< "$bpf_path"',
      '_',
      bpfPath,
      argsPath,
      '--',
      finalCommand,
      ...finalArgs,
    ];

    return {
      program: 'sh',
      args: shArgs,
      env: sanitizedEnv,
      cwd: req.cwd,
      cleanup: () => {
        try {
          fs.unlinkSync(argsPath);
        } catch {
          // Ignore cleanup errors
        }
      },
    };
  }

  protected override isCaseInsensitive(): boolean {
    return false;
  }

  isDangerousCommand(args: string[]): boolean {
    return isPosixDangerousCommand(args);
  }

  protected override isOsSafeCommand(args: string[]): boolean {
    return isPosixSafeCommand(args);
  }

  protected override async isStrictlyApproved(
    command: string,
    args: string[],
    req: SandboxRequest,
  ): Promise<boolean> {
    return isStrictlyApproved(
      { ...req, command, args },
      this.options.modeConfig?.approvedTools,
    );
  }

  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return parsePosixSandboxDenials(result, this.denialCache);
  }

  private writeArgsToTempFile(args: string[]): string {
    const tempFile = join(
      os.tmpdir(),
      `gemini-cli-bwrap-args-${Date.now()}-${Math.random().toString(36).slice(2)}.args`,
    );
    const content = Buffer.from(args.join('\0') + '\0');
    fs.writeFileSync(tempFile, content, { mode: 0o600 });
    return tempFile;
  }

  private getMaskFilePath(): string {
    if (this.maskFilePath && fs.existsSync(this.maskFilePath)) {
      return this.maskFilePath;
    }
    const tempDir = fs.mkdtempSync(join(os.tmpdir(), 'gemini-cli-mask-file-'));
    const maskPath = join(tempDir, 'mask');
    fs.writeFileSync(maskPath, '');
    fs.chmodSync(maskPath, 0);
    this.maskFilePath = maskPath;

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
}
