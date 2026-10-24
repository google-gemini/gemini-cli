/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type SandboxManager,
  type SandboxRequest,
  type SandboxedCommand,
  type SandboxPermissions,
  type GlobalSandboxOptions,
  type ParsedSandboxDenial,
  resolveSandboxPaths,
} from '../../services/sandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
} from '../../services/environmentSanitization.js';
import { buildSeatbeltProfile } from './seatbeltArgsBuilder.js';
import {
  initializeShellParsers,
  getCommandRoots,
  stripShellWrapper,
} from '../../utils/shell-utils.js';
import {
  isKnownSafeCommand,
  isDangerousCommand,
} from '../utils/commandSafety.js';
import {
  verifySandboxOverrides,
  getCommandName as getFullCommandName,
  isStrictlyApproved,
} from '../utils/commandUtils.js';
import {
  parsePosixSandboxDenials,
  createSandboxDenialCache,
  type SandboxDenialCache,
} from '../utils/sandboxDenialUtils.js';
import { handleReadWriteCommands } from '../utils/sandboxReadWriteUtils.js';

export class MacOsSandboxManager implements SandboxManager {
  private readonly denialCache: SandboxDenialCache = createSandboxDenialCache();

  constructor(private readonly options: GlobalSandboxOptions) {}

  isKnownSafeCommand(args: string[]): boolean {
    const toolName = args[0];
    const approvedTools = this.options.modeConfig?.approvedTools ?? [];
    if (toolName && approvedTools.includes(toolName)) {
      return true;
    }
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

  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    await initializeShellParsers();
    const sanitizationConfig = getSecureSanitizationConfig(
      req.policy?.sanitizationConfig,
    );

    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    const isReadonlyMode = this.options.modeConfig?.readonly ?? true;
    const allowOverrides = this.options.modeConfig?.allowOverrides ?? true;

    // Reject override attempts in plan mode
    verifySandboxOverrides(allowOverrides, req.policy);

    let command = req.command;
    let args = req.args;

    // Translate virtual commands for sandboxed file system access
    if (command === '__read') {
      command = '/bin/cat';
    } else if (command === '__write') {
      command = '/bin/sh';
      args = ['-c', 'cat > "$1"', '_', ...args];
    }

    const currentReq = { ...req, command, args };

    // If not in readonly mode OR it's a strictly approved pipeline, allow workspace writes
    const isApproved = allowOverrides
      ? await isStrictlyApproved(
          currentReq,
          this.options.modeConfig?.approvedTools,
        )
      : false;

    const isYolo = this.options.modeConfig?.yolo ?? false;
    const workspaceWrite = !isReadonlyMode || isApproved || isYolo;
    const defaultNetwork =
      this.options.modeConfig?.network || req.policy?.networkAccess || isYolo;

    // Fetch persistent approvals for this command
    const commandName = await getFullCommandName(currentReq);
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
        defaultNetwork ||
        persistentPermissions?.network ||
        req.policy?.additionalPermissions?.network ||
        false,
    };

    // If the workspace is writable and we're running a git command,
    // automatically allow write access to the .git directory.
    const fullCmd = [command, ...args].join(' ');
    const stripped = stripShellWrapper(fullCmd);
    const roots = getCommandRoots(stripped).filter(
      (r) => r !== 'shopt' && r !== 'set',
    );
    const isGitCommand = roots.includes('git');

    if (workspaceWrite && isGitCommand) {
      const gitDir = path.join(this.options.workspace, '.git');
      if (!mergedAdditional.fileSystem!.write!.includes(gitDir)) {
        mergedAdditional.fileSystem!.write!.push(gitDir);
      }
    }

    const { command: finalCommand, args: finalArgs } = handleReadWriteCommands(
      req,
      mergedAdditional,
      this.options.workspace,
      [
        ...(req.policy?.allowedPaths || []),
        ...(this.options.includeDirectories || []),
      ],
    );

    const resolvedPaths = await resolveSandboxPaths(
      this.options,
      req,
      mergedAdditional,
    );

    const sandboxArgs = buildSeatbeltProfile({
      resolvedPaths,
      networkAccess: mergedAdditional.network,
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

  private writeProfileToTempFile(profile: string): string {
    const tempFile = path.join(
      os.tmpdir(),
      `gemini-cli-seatbelt-${Date.now()}-${Math.random().toString(36).slice(2)}.sb`,
    );
    fs.writeFileSync(tempFile, profile, { mode: 0o600 });
    return tempFile;
  }
}
