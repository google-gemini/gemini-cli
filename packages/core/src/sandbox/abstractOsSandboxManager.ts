/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SandboxManager,
  GlobalSandboxOptions,
  SandboxRequest,
  SandboxedCommand,
  SandboxPermissions,
  ParsedSandboxDenial,
} from '../services/sandboxManager.js';
import type { ShellExecutionResult } from '../services/shellExecutionService.js';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
} from '../services/environmentSanitization.js';
import {
  verifySandboxOverrides,
  getCommandName,
} from './utils/commandUtils.js';
import {
  createSandboxDenialCache,
  type SandboxDenialCache,
} from './utils/sandboxDenialUtils.js';
import {
  type ResolvedSandboxPaths,
  resolveSandboxPaths,
} from './utils/sandboxPathUtils.js';

export interface PreparedExecutionDetails {
  finalCommand: string;
  finalArgs: string[];
  sanitizedEnv: NodeJS.ProcessEnv;
  resolvedPaths: ResolvedSandboxPaths;
  workspaceWrite: boolean;
  networkAccess: boolean;
  req: SandboxRequest;
}

/**
 * Base class for OS-specific sandbox managers.
 * Enforces the Template Method pattern for command preparation.
 */
export abstract class AbstractOsSandboxManager implements SandboxManager {
  protected readonly denialCache: SandboxDenialCache =
    createSandboxDenialCache();
  protected governanceFilesInitialized = false;

  constructor(protected readonly options: GlobalSandboxOptions) {}

  getWorkspace(): string {
    return this.options.workspace;
  }

  getOptions(): GlobalSandboxOptions {
    return this.options;
  }

  /**
   * Prepares a command for sandboxed execution by resolving permissions and paths.
   */
  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    // Initialize OS-specific sandbox mechanisms if needed
    await this.initialize();

    // Sanitize environment variables based on policy
    const sanitizationConfig = getSecureSanitizationConfig(
      req.policy?.sanitizationConfig,
    );
    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    // Verify that request doesn't attempt illegal overrides
    const isReadonlyMode = this.options.modeConfig?.readonly ?? true;
    const allowOverrides = this.options.modeConfig?.allowOverrides ?? true;
    verifySandboxOverrides(allowOverrides, req.policy);

    // Translate virtual commands (like __read) to native commands
    const { command, args } = this.mapVirtualCommandToNative(
      req.command,
      req.args,
    );

    // Extract a stable command name for policy lookup
    const commandName = await getCommandName({ ...req, command, args });

    // Determine if this specific execution is strictly approved
    const isApproved = allowOverrides
      ? await this.isStrictlyApproved(command, args, req)
      : false;

    // Resolve broad write permissions (workspace, readonly, yolo)
    const isYolo = this.options.modeConfig?.yolo ?? false;
    const workspaceWrite = !isReadonlyMode || isApproved || isYolo;

    const defaultNetwork =
      this.options.modeConfig?.network || req.policy?.networkAccess || isYolo;

    // Load persistent permissions for this command from policy manager
    const persistentPermissions = allowOverrides
      ? this.options.policyManager?.getCommandPermissions(commandName)
      : undefined;

    // Merge request-specific and persistent permissions
    const mergedPermissions: SandboxPermissions = {
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

    // Allow OS-specific managers to update permissions (rules) based on the request (e.g., Windows tracking file targets for manifests)
    this.updateReadWritePermissions(mergedPermissions, req);

    // Allow OS-specific managers to rewrite the command (action) based on permissions (e.g., resolving read/write paths for POSIX systems)
    const { command: finalCommand, args: finalArgs } =
      this.rewriteReadWriteCommand(req, command, args, mergedPermissions);

    // Resolve all paths to absolute real paths
    const resolvedPaths = await resolveSandboxPaths(
      this.options,
      req,
      mergedPermissions,
    );

    // Ensure sandbox policy evidence files exist in workspace
    this.ensureGovernanceFilesExist(resolvedPaths.workspace.resolved);

    // Delegate the actual construction of the sandboxed invocation
    return this.buildSandboxedCommand({
      finalCommand,
      finalArgs,
      sanitizedEnv,
      resolvedPaths,
      workspaceWrite,
      networkAccess: mergedPermissions.network ?? false,
      req,
    });
  }

  /**
   * Checks if a command is allowed by policy or considered safe by the OS.
   */
  isKnownSafeCommand(args: string[]): boolean {
    const toolName = args[0];
    if (!toolName) return false;

    if (this.isToolApproved(toolName)) {
      return true;
    }

    return this.isOsSafeCommand(args);
  }

  /**
   * Checks if a tool is in the list of approved tools.
   */
  protected isToolApproved(toolName: string): boolean {
    const tools = this.options.modeConfig?.approvedTools ?? [];
    if (tools.length === 0) return false;

    if (this.isCaseInsensitive()) {
      const targetTool = toolName.toLowerCase();
      return tools.map((t) => t.toLowerCase()).includes(targetTool);
    }

    return tools.includes(toolName);
  }

  /**
   * Lifecycle hook called at the very beginning of command preparation.
   * Used for OS-specific initialization (e.g., compiling helpers).
   */
  protected abstract initialize(): Promise<void>;

  /**
   * Ensures that governance files exist in the sandbox workspace.
   */
  protected abstract ensureGovernanceFilesExist(workspace: string): void;

  /**
   * Translates virtual commands (like `__read` or `__write`) into native OS commands.
   */
  protected abstract mapVirtualCommandToNative(
    command: string,
    args: string[],
  ): { command: string; args: string[] };

  /**
   * Allows OS-specific managers to update permissions (rules) for read/write commands.
   */
  protected abstract updateReadWritePermissions(
    permissions: SandboxPermissions,
    req: SandboxRequest,
  ): void;

  /**
   * Allows OS-specific managers to rewrite the command (action) for read/write commands
   * after permissions are resolved.
   */
  protected abstract rewriteReadWriteCommand(
    req: SandboxRequest,
    command: string,
    args: string[],
    permissions: SandboxPermissions,
  ): { command: string; args: string[] };

  /**
   * Builds the final sandboxed command execution details.
   */
  protected abstract buildSandboxedCommand(
    details: PreparedExecutionDetails,
  ): Promise<SandboxedCommand>;

  /**
   * Returns whether the filesystem is case-insensitive.
   */
  protected abstract isCaseInsensitive(): boolean;

  /**
   * Returns whether the command or arguments are considered dangerous
   * regardless of the sandbox configuration.
   */
  abstract isDangerousCommand(args: string[]): boolean;

  /**
   * OS-specific check for known safe commands.
   */
  protected abstract isOsSafeCommand(args: string[]): boolean;

  /**
   * Checks if the command is strictly approved for execution,
   * potentially overriding read-only restrictions.
   */
  protected abstract isStrictlyApproved(
    command: string,
    args: string[],
    req: SandboxRequest,
  ): Promise<boolean>;

  /**
   * Parses denials from execution output to populate the cache.
   */
  abstract parseDenials(
    result: ShellExecutionResult,
  ): ParsedSandboxDenial | undefined;
}
