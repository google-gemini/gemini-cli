/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { join, dirname } from 'node:path';
import os from 'node:os';
import {
  type SandboxManager,
  type GlobalSandboxOptions,
  type SandboxRequest,
  type SandboxedCommand,
  type SandboxPermissions,
  GOVERNANCE_FILES,
  type ParsedSandboxDenial,
  resolveSandboxPaths,
} from '../../services/sandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
} from '../../services/environmentSanitization.js';
import {
  isStrictlyApproved,
  verifySandboxOverrides,
  getCommandName,
} from '../utils/commandUtils.js';
import { assertValidPathString } from '../../utils/paths.js';
import {
  isKnownSafeCommand,
  isDangerousCommand,
} from '../utils/commandSafety.js';
import {
  parsePosixSandboxDenials,
  createSandboxDenialCache,
  type SandboxDenialCache,
} from '../utils/sandboxDenialUtils.js';
import { handleReadWriteCommands } from '../utils/sandboxReadWriteUtils.js';
import { buildBwrapArgs } from './bwrapArgsBuilder.js';

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
  assertValidPathString(filePath);
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
  private static maskFilePath: string | undefined;
  private readonly denialCache: SandboxDenialCache = createSandboxDenialCache();

  constructor(private readonly options: GlobalSandboxOptions) {}

  isKnownSafeCommand(args: string[]): boolean {
    return isKnownSafeCommand(args);
  }

  isDangerousCommand(args: string[]): boolean {
    return isDangerousCommand(args);
  }

  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return parsePosixSandboxDenials(result, this.denialCache);
  }

  getWorkspace(): string {
    return this.options.workspace;
  }

  getOptions(): GlobalSandboxOptions {
    return this.options;
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

    let command = req.command;
    let args = req.args;

    // Translate virtual commands for sandboxed file system access
    if (command === '__read') {
      command = 'cat';
    } else if (command === '__write') {
      command = 'sh';
      args = ['-c', 'cat > "$1"', '_', ...args];
    }

    const commandName = await getCommandName({ ...req, command, args });
    const isApproved = allowOverrides
      ? await isStrictlyApproved(
          { ...req, command, args },
          this.options.modeConfig?.approvedTools,
        )
      : false;
    const isYolo = this.options.modeConfig?.yolo ?? false;
    const workspaceWrite = !isReadonlyMode || isApproved || isYolo;

    const networkAccess =
      this.options.modeConfig?.network || req.policy?.networkAccess || isYolo;

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

    const { command: finalCommand, args: finalArgs } = handleReadWriteCommands(
      req,
      mergedAdditional,
      this.options.workspace,
      req.policy?.allowedPaths,
    );

    const sanitizationConfig = getSecureSanitizationConfig(
      req.policy?.sanitizationConfig,
    );

    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    const resolvedPaths = await resolveSandboxPaths(
      this.options,
      req,
      mergedAdditional,
    );

    for (const file of GOVERNANCE_FILES) {
      const filePath = join(this.options.workspace, file.path);
      touch(filePath, file.isDirectory);
    }

    const bwrapArgs = await buildBwrapArgs({
      workspace: this.options.workspace,
      workspaceWrite,
      networkAccess,
      allowedPaths: resolvedPaths.policyAllowed,
      forbiddenPaths: resolvedPaths.forbidden,
      additionalPermissions: mergedAdditional,
      includeDirectories: this.options.includeDirectories || [],
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
