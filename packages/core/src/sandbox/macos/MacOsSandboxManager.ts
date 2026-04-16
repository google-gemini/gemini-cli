/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type SandboxRequest,
  type SandboxedCommand,
  type SandboxPermissions,
  type ParsedSandboxDenial,
} from '../../services/sandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import { buildSeatbeltProfile } from './seatbeltArgsBuilder.js';
import { isStrictlyApproved } from '../utils/commandUtils.js';
import { initializeShellParsers } from '../../utils/shell-utils.js';
import {
  isKnownSafeCommand as isPosixSafeCommand,
  isDangerousCommand as isPosixDangerousCommand,
} from '../utils/commandSafety.js';
import { parsePosixSandboxDenials } from '../utils/sandboxDenialUtils.js';
import { handleReadWriteCommands } from '../utils/sandboxReadWriteUtils.js';
import {
  AbstractOsSandboxManager,
  type PreparedExecutionDetails,
} from '../abstractOsSandboxManager.js';

export class MacOsSandboxManager extends AbstractOsSandboxManager {
  protected override async initialize(): Promise<void> {
    await initializeShellParsers();
  }

  protected override ensureGovernanceFilesExist(_workspace: string): void {
    // Default no-op - Seatbelt is able to block non-existent files
  }

  /**
   * Mapping virtual commands to absolute paths of native tools ensures that
   * Seatbelt profiles can target the exact binaries accurately.
   */
  protected override mapVirtualCommandToNative(
    command: string,
    args: string[],
  ): { command: string; args: string[] } {
    if (command === '__read') {
      return { command: '/bin/cat', args };
    }
    if (command === '__write') {
      return { command: '/bin/sh', args: ['-c', 'cat > "$1"', '_', ...args] };
    }
    return { command, args };
  }

  /**
   * macOS permissions are enforced via dynamically generated Seatbelt profiles
   * based on file paths. No dynamic tweaking of the request object is needed here.
   */
  protected override updateReadWritePermissions(
    _permissions: SandboxPermissions,
    _req: SandboxRequest,
  ): void {
    // Default no-op
  }

  /**
   * Ensures read/write commands strictly respect allowed paths and workspace boundaries
   * before the Seatbelt profile is generated.
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

    const sandboxArgs = buildSeatbeltProfile({
      resolvedPaths,
      networkAccess,
      workspaceWrite,
    });

    const tempFile = this.writeProfileToTempFile(sandboxArgs);

    return {
      program: '/usr/bin/sandbox-exec',
      args: ['-f', tempFile, '--', finalCommand, ...finalArgs],
      env: sanitizedEnv,
      cwd: req.cwd,
      cleanup: () => {
        try {
          fs.unlinkSync(tempFile);
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

  private writeProfileToTempFile(profile: string): string {
    const tempFile = path.join(
      os.tmpdir(),
      `gemini-cli-seatbelt-${Date.now()}-${Math.random().toString(36).slice(2)}.sb`,
    );
    fs.writeFileSync(tempFile, profile, { mode: 0o600 });
    return tempFile;
  }
}
