/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  SandboxRequest,
  SandboxedCommand,
  SandboxPermissions,
  GlobalSandboxOptions,
  ParsedSandboxDenial,
} from '../../services/sandboxManager.js';
import type { ResolvedSandboxPaths } from '../abstractOsSandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import { buildSeatbeltProfile } from './seatbeltArgsBuilder.js';
import { AbstractOsSandboxManager } from '../abstractOsSandboxManager.js';
import {
  isKnownSafeCommand as isPosixSafeCommand,
  isDangerousCommand as isPosixDangerousCommand,
} from '../utils/commandSafety.js';
import { parsePosixSandboxDenials } from '../utils/sandboxDenialUtils.js';
import { handleReadWriteCommands } from '../utils/sandboxReadWriteUtils.js';

export class MacOsSandboxManager extends AbstractOsSandboxManager {
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

  protected async buildSandboxedExecution(
    req: SandboxRequest,
    finalCmd: { command: string; args: string[] },
    sanitizedEnv: NodeJS.ProcessEnv,
    mergedAdditional: SandboxPermissions,
    resolvedPaths: ResolvedSandboxPaths,
    workspaceWrite: boolean,
  ): Promise<SandboxedCommand> {
    const sandboxArgs = buildSeatbeltProfile({
      resolvedPaths,
      networkAccess: mergedAdditional.network,
      workspaceWrite,
    });

    const tempFile = this.writeProfileToTempFile(sandboxArgs);

    return {
      program: '/usr/bin/sandbox-exec',
      args: ['-f', tempFile, '--', finalCmd.command, ...finalCmd.args],
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

  private writeProfileToTempFile(profile: string): string {
    const tempFile = path.join(
      os.tmpdir(),
      `gemini-cli-seatbelt-${Date.now()}-${Math.random().toString(36).slice(2)}.sb`,
    );
    fs.writeFileSync(tempFile, profile, { mode: 0o600 });
    return tempFile;
  }
}
