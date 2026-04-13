/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import { dirname, join } from 'node:path';
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
import { verifySandboxOverrides } from './utils/commandUtils.js';
import {
  assertValidPathString,
  deduplicateAbsolutePaths,
  toPathKey,
  resolveToRealPath,
} from '../utils/paths.js';
import {
  createSandboxDenialCache,
  type SandboxDenialCache,
} from './utils/sandboxDenialUtils.js';
import { getCommandName } from '../utils/shell-utils.js';
import { resolveGitWorktreePaths } from './utils/fsUtils.js';
import { validateVirtualCommandPaths } from './utils/sandboxReadWriteUtils.js';

/**
 * A structured result of fully resolved sandbox paths.
 * All paths in this object are absolute, deduplicated, and expanded to include
 * both the original path and its real target (if it is a symlink).
 */
export interface ResolvedSandboxPaths {
  /** The primary workspace directory. */
  workspace: {
    /** The original path provided in the sandbox options. */
    original: string;
    /** The real path. */
    resolved: string;
  };
  /** Explicitly denied paths. */
  forbidden: string[];
  /** Directories included globally across all commands in this sandbox session. */
  globalIncludes: string[];
  /** Paths explicitly allowed by the policy of the currently executing command. */
  policyAllowed: string[];
  /** Paths granted temporary read access by the current command's dynamic permissions. */
  policyRead: string[];
  /** Paths granted temporary write access by the current command's dynamic permissions. */
  policyWrite: string[];
  /** Auto-detected paths for git worktrees/submodules. */
  gitWorktree?: {
    /** The actual .git directory for this worktree. */
    worktreeGitDir: string;
    /** The main repository's .git directory (if applicable). */
    mainGitDir?: string;
  };
}

/**
 * Files that represent the governance or "constitution" of the repository
 * and should be write-protected in any sandbox.
 */
export const GOVERNANCE_FILES = [
  { path: '.gitignore', isDirectory: false },
  { path: '.geminiignore', isDirectory: false },
  { path: '.git', isDirectory: true },
] as const;

/**
 * Files that contain sensitive secrets or credentials and should be
 * completely hidden (deny read/write) in any sandbox.
 */
export const SECRET_FILES = [
  { pattern: '.env' },
  { pattern: '.env.*' },
] as const;

/**
 * Resolves and sanitizes all path categories for a sandbox request.
 */
export async function resolveSandboxPaths(
  options: GlobalSandboxOptions,
  req: SandboxRequest,
  overridePermissions?: SandboxPermissions,
): Promise<ResolvedSandboxPaths> {
  /**
   * Helper that expands each path to include its realpath (if it's a symlink)
   * and pipes the result through deduplicateAbsolutePaths for deduplication and absolute path enforcement.
   */
  const expand = (paths?: string[] | null): string[] => {
    if (!paths || paths.length === 0) return [];
    const expanded = paths.flatMap((p) => {
      try {
        const resolved = resolveToRealPath(p);
        return resolved === p ? [p] : [p, resolved];
      } catch {
        return [p];
      }
    });
    return deduplicateAbsolutePaths(expanded);
  };

  const forbidden = expand(await options.forbiddenPaths?.());

  const globalIncludes = expand(options.includeDirectories);
  const policyAllowed = expand(req.policy?.allowedPaths);

  const policyRead = expand(overridePermissions?.fileSystem?.read);
  const policyWrite = expand(overridePermissions?.fileSystem?.write);

  const resolvedWorkspace = resolveToRealPath(options.workspace);

  const workspaceIdentities = new Set(
    [options.workspace, resolvedWorkspace].map(toPathKey),
  );
  const forbiddenIdentities = new Set(forbidden.map(toPathKey));

  const { worktreeGitDir, mainGitDir } =
    await resolveGitWorktreePaths(resolvedWorkspace);
  const gitWorktree = worktreeGitDir
    ? { gitWorktree: { worktreeGitDir, mainGitDir } }
    : undefined;

  /**
   * Filters out any paths that are explicitly forbidden or match the workspace root (original or resolved).
   */
  const filter = (paths: string[]) =>
    paths.filter((p) => {
      const identity = toPathKey(p);
      return (
        !workspaceIdentities.has(identity) && !forbiddenIdentities.has(identity)
      );
    });

  return {
    workspace: {
      original: options.workspace,
      resolved: resolvedWorkspace,
    },
    forbidden,
    globalIncludes: filter(globalIncludes),
    policyAllowed: filter(policyAllowed),
    policyRead: filter(policyRead),
    policyWrite: filter(policyWrite),
    ...gitWorktree,
  };
}

export abstract class AbstractOsSandboxManager implements SandboxManager {
  protected readonly denialCache: SandboxDenialCache =
    createSandboxDenialCache();

  constructor(protected readonly options: GlobalSandboxOptions) {}

  abstract isKnownSafeCommand(args: string[]): boolean;
  abstract isDangerousCommand(args: string[]): boolean;
  abstract parseDenials(
    result: ShellExecutionResult,
  ): ParsedSandboxDenial | undefined;

  getWorkspace(): string {
    return this.options.workspace;
  }

  getOptions(): GlobalSandboxOptions {
    return this.options;
  }

  protected touch(filePath: string, isDirectory: boolean): void {
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
      const dir = dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.closeSync(fs.openSync(filePath, 'a'));
    }
  }

  protected isToolApproved(
    toolName: string,
    caseInsensitive: boolean = false,
  ): boolean {
    const approvedTools = this.options.modeConfig?.approvedTools;
    if (!approvedTools || approvedTools.length === 0) return false;

    if (caseInsensitive) {
      return approvedTools.some(
        (t) => t.toLowerCase() === toolName.toLowerCase(),
      );
    }
    return approvedTools.includes(toolName);
  }

  protected abstract get isCaseInsensitive(): boolean;

  protected resolveFinalCommand(
    req: SandboxRequest,
    _permissions: SandboxPermissions,
    _resolvedPaths: ResolvedSandboxPaths,
  ): { command: string; args: string[] } {
    return { command: req.command, args: req.args };
  }

  protected abstract buildSandboxedExecution(
    req: SandboxRequest,
    finalCmd: { command: string; args: string[] },
    sanitizedEnv: NodeJS.ProcessEnv,
    mergedAdditional: SandboxPermissions,
    resolvedPaths: ResolvedSandboxPaths,
    workspaceWrite: boolean,
  ): Promise<SandboxedCommand>;

  protected adjustPermissionsForVirtualCommands(
    req: SandboxRequest,
    permissions: SandboxPermissions,
  ): void {
    if (req.command === '__read' || req.command === '__write') {
      validateVirtualCommandPaths(req, this.options.workspace, [
        ...(req.policy?.allowedPaths || []),
        ...(this.options.includeDirectories || []),
      ]);

      if (req.command === '__read') {
        permissions.fileSystem!.read!.push(...req.args);
      } else {
        permissions.fileSystem!.write!.push(...req.args);
      }
    }
  }

  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    const sanitizationConfig = getSecureSanitizationConfig(
      req.policy?.sanitizationConfig,
    );
    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    const isReadonlyMode = this.options.modeConfig?.readonly ?? true;
    const allowOverrides = this.options.modeConfig?.allowOverrides ?? true;

    // Reject override attempts in plan mode
    verifySandboxOverrides(allowOverrides, req.policy);

    const isYolo = this.options.modeConfig?.yolo ?? false;

    const commandName = await getCommandName(req.command, req.args);

    // If not in readonly mode OR it's a strictly approved pipeline, allow workspace writes
    const isApproved = allowOverrides
      ? this.isToolApproved(commandName, this.isCaseInsensitive)
      : false;

    const workspaceWrite: boolean = !isReadonlyMode || isApproved || isYolo;
    const defaultNetwork =
      this.options.modeConfig?.network || req.policy?.networkAccess || isYolo;

    // Fetch persistent approvals for this command
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

    this.adjustPermissionsForVirtualCommands(req, mergedAdditional);

    const resolvedPaths = await resolveSandboxPaths(
      this.options,
      req,
      mergedAdditional,
    );

    const { command: finalCommand, args: finalArgs } = this.resolveFinalCommand(
      req,
      mergedAdditional,
      resolvedPaths,
    );

    for (const file of GOVERNANCE_FILES) {
      const filePath = join(resolvedPaths.workspace.resolved, file.path);
      this.touch(filePath, file.isDirectory);
    }

    return this.buildSandboxedExecution(
      req,
      { command: finalCommand, args: finalArgs },
      sanitizedEnv,
      mergedAdditional,
      resolvedPaths,
      workspaceWrite,
    );
  }
}
