/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import type { SafetyCheckInput, SafetyCheckResult } from './protocol.js';
import type { AllowedPathConfig } from '../policy/types.js';

/**
 * Interface for all in-process safety checkers.
 */
export interface InProcessChecker {
  check(input: SafetyCheckInput): Promise<SafetyCheckResult>;
}

/**
 * An in-process checker to validate file paths.
 */
export class AllowedPathChecker implements InProcessChecker {
  async check(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    const { toolCall, context } = input;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (toolCall as any).config as AllowedPathConfig | undefined;
    const followSymlinks = config?.follow_symlinks ?? false;

    // Build list of allowed directories
    const allowedDirs = [
      context.environment.cwd,
      ...context.environment.workspaces,
      ...(config?.additional_allowed_paths ?? []),
    ];

    // Find all arguments that look like paths
    const pathsToCheck: string[] = [];
    if (toolCall.args) {
      for (const key in toolCall.args) {
        if (
          key.includes('path') ||
          key.includes('directory') ||
          key.includes('file') ||
          key === 'source' ||
          key === 'destination'
        ) {
          const value = toolCall.args[key];
          if (typeof value === 'string') {
            pathsToCheck.push(value);
          }
        }
      }
    }

    // Check each path
    for (const p of pathsToCheck) {
      const resolvedPath = this.safelyResolvePath(
        p,
        context.environment.cwd,
        followSymlinks,
      );

      if (!resolvedPath) {
        // If path cannot be resolved, deny it
        return {
          allowed: false,
          reason: `Cannot resolve path "${p}"`,
        };
      }

      const isAllowed = allowedDirs.some((dir) => {
        // Also resolve allowed directories to handle symlinks
        const resolvedDir = this.safelyResolvePath(
          dir,
          context.environment.cwd,
          followSymlinks,
        );
        if (!resolvedDir) return false;
        return this.isPathAllowed(resolvedPath, resolvedDir);
      });

      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Path "${p}" is outside of the allowed workspace directories.`,
        };
      }
    }

    return { allowed: true };
  }

  private safelyResolvePath(
    inputPath: string,
    cwd: string,
    followSymlinks: boolean,
  ): string | null {
    try {
      let resolved = path.resolve(cwd, inputPath);
      if (followSymlinks && fs.existsSync(resolved)) {
        resolved = fs.realpathSync(resolved);
      }
      return resolved;
    } catch (_error) {
      return null;
    }
  }

  private isPathAllowed(targetPath: string, allowedDir: string): boolean {
    const relative = path.relative(allowedDir, targetPath);
    return (
      relative === '' ||
      (!relative.startsWith('..') && !path.isAbsolute(relative))
    );
  }
}
