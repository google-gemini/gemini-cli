/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type SandboxManager,
  type SandboxRequest,
  type SandboxedCommand,
  type SandboxPermissions,
  type GlobalSandboxOptions,
} from '../../services/sandboxManager.js';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
  type EnvironmentSanitizationConfig,
} from '../../services/environmentSanitization.js';
import { buildSeatbeltArgs } from './seatbeltArgsBuilder.js';
import { initializeShellParsers } from '../../utils/shell-utils.js';
import { isStrictlyApproved, getCommandName } from '../utils/commandUtils.js';
import { type SandboxPolicyManager } from '../../policy/sandboxPolicyManager.js';

export interface MacOsSandboxOptions extends GlobalSandboxOptions {
  /** Optional base sanitization config. */
  sanitizationConfig?: EnvironmentSanitizationConfig;
  /** The current sandbox mode behavior from config. */
  modeConfig?: {
    readonly?: boolean;
    network?: boolean;
    approvedTools?: string[];
    allowOverrides?: boolean;
  };
  /** The policy manager for persistent approvals. */
  policyManager?: SandboxPolicyManager;
}

/**
 * A SandboxManager implementation for macOS that uses Seatbelt.
 */
export class MacOsSandboxManager implements SandboxManager {
  constructor(private readonly options: MacOsSandboxOptions) {}

  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    await initializeShellParsers();
    const sanitizationConfig = getSecureSanitizationConfig(
      req.policy?.sanitizationConfig,
    );

    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    const isReadonlyMode = this.options.modeConfig?.readonly ?? true;
    const allowOverrides = this.options.modeConfig?.allowOverrides ?? true;

    // Reject override attempts in plan mode
    if (!allowOverrides && req.policy?.additionalPermissions) {
      const perms = req.policy.additionalPermissions;
      if (
        perms.network ||
        (perms.fileSystem?.write && perms.fileSystem.write.length > 0)
      ) {
        throw new Error(
          'Sandbox request rejected: Cannot override readonly/network restrictions in Plan mode.',
        );
      }
    }

    // If not in readonly mode OR it's a strictly approved pipeline, allow workspace writes
    const isApproved = allowOverrides
      ? await isStrictlyApproved(req, this.options.modeConfig?.approvedTools)
      : false;

    const workspaceWrite = !isReadonlyMode || isApproved;
    const networkAccess =
      this.options.modeConfig?.network ?? req.policy?.networkAccess ?? false;

    // Fetch persistent approvals for this command
    const commandName = await getCommandName(req);
    const persistentPermissions = allowOverrides
      ? this.options.policyManager?.getCommandPermissions(commandName)
      : undefined;

    // Merge all permissions
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

    const sandboxArgs = buildSeatbeltArgs({
      workspace: this.options.workspace,
      allowedPaths: [...(req.policy?.allowedPaths || [])],
      forbiddenPaths: req.policy?.forbiddenPaths,
      networkAccess: mergedAdditional.network,
      workspaceWrite,
      additionalPermissions: mergedAdditional,
    });

    return {
      program: '/usr/bin/sandbox-exec',
      args: [...sandboxArgs, '--', req.command, ...req.args],
      env: sanitizedEnv,
      cwd: req.cwd,
    };
  }
}
