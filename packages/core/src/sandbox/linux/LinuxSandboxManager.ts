/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import type {
  GlobalSandboxOptions,
  SandboxRequest,
  SandboxedCommand,
  SandboxPermissions,
  ParsedSandboxDenial,
} from '../../services/sandboxManager.js';
import {
  type ResolvedSandboxPaths,
  AbstractOsSandboxManager,
} from '../abstractOsSandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import { buildBwrapArgs } from './bwrapArgsBuilder.js';
import {
  isKnownSafeCommand as isPosixSafeCommand,
  isDangerousCommand as isPosixDangerousCommand,
} from '../utils/commandSafety.js';
import { parsePosixSandboxDenials } from '../utils/sandboxDenialUtils.js';
import { handleReadWriteCommands } from '../utils/sandboxReadWriteUtils.js';

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
 * A SandboxManager implementation for Linux that uses Bubblewrap (bwrap).
 */
export class LinuxSandboxManager extends AbstractOsSandboxManager {
  private static maskFilePath: string | undefined;

  constructor(options: GlobalSandboxOptions) {
    super(options);
  }

  isKnownSafeCommand(args: string[]): boolean {
    const toolName = args[0];
    if (toolName && this.isToolApproved(toolName)) {
      return true;
    }
    return isPosixSafeCommand(args);
  }

  isDangerousCommand(args: string[]): boolean {
    return isPosixDangerousCommand(args);
  }

  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return parsePosixSandboxDenials(result, this.denialCache);
  }

  protected get isCaseInsensitive(): boolean {
    return false;
  }

  protected override resolveFinalCommand(
    req: SandboxRequest,
    _permissions: SandboxPermissions,
    _resolvedPaths: ResolvedSandboxPaths,
  ): { command: string; args: string[] } {
    return handleReadWriteCommands(req);
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

  protected async buildSandboxedExecution(
    req: SandboxRequest,
    finalCmd: { command: string; args: string[] },
    sanitizedEnv: NodeJS.ProcessEnv,
    mergedAdditional: SandboxPermissions,
    resolvedPaths: ResolvedSandboxPaths,
    workspaceWrite: boolean,
  ): Promise<SandboxedCommand> {
    const bwrapArgs = await buildBwrapArgs({
      resolvedPaths,
      workspaceWrite,
      networkAccess: mergedAdditional.network ?? false,
      maskFilePath: this.getMaskFilePath(),
      isWriteCommand: req.command === '__write',
    });

    const bpfPath = getSeccompBpfPath();
    bwrapArgs.push('--seccomp', '9');

    const argsPath = this.writeArgsToTempFile(bwrapArgs);

    const shArgs = [
      '-c',
      'bpf_path="$1"; args_path="$2"; shift 2; exec bwrap --args 8 "$@" 8< "$args_path" 9< "$bpf_path"',
      '_',
      bpfPath,
      argsPath,
      '--',
      finalCmd.command,
      ...finalCmd.args,
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

  private writeArgsToTempFile(args: string[]): string {
    const tempFile = join(
      os.tmpdir(),
      `gemini-cli-bwrap-args-${Date.now()}-${Math.random().toString(36).slice(2)}.args`,
    );
    const content = Buffer.from(args.join('\0') + '\0');
    fs.writeFileSync(tempFile, content, { mode: 0o600 });
    return tempFile;
  }
}
