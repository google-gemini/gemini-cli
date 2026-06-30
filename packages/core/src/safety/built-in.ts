/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import {
  SafetyCheckDecision,
  type SafetyCheckInput,
  type SafetyCheckResult,
} from './protocol.js';
import type { AllowedPathConfig } from '../policy/types.js';
import { resolveToRealPath } from '../utils/paths.js';

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const config = input.config as AllowedPathConfig | undefined;

    // Build list of allowed directories
    const allowedDirs = [
      context.environment.cwd,
      ...context.environment.workspaces,
    ];

    // Find all arguments that look like paths
    const includedArgs = config?.included_args ?? [];
    const excludedArgs = config?.excluded_args ?? [];

    const pathsToCheck = this.collectPathsToCheck(
      toolCall.args,
      includedArgs,
      excludedArgs,
    );

    // Resolve allowed directories once outside the loop to avoid redundant filesystem calls
    const resolvedAllowedDirs = allowedDirs
      .map((dir) => this.safelyResolvePath(dir, context.environment.cwd))
      .filter((resolvedDir): resolvedDir is string => resolvedDir !== null);

    // Check each path
    for (const { path: p, argName } of pathsToCheck) {
      const resolvedPath = this.safelyResolvePath(p, context.environment.cwd);

      if (!resolvedPath) {
        // If path cannot be resolved, deny it
        return {
          decision: SafetyCheckDecision.DENY,
          reason: `Cannot resolve path "${p}" in argument "${argName}"`,
        };
      }

      // Check for blocked segments case-insensitively
      let hasBlockedSegment = false;
      let isVscodePath = false;

      for (const resolvedDir of resolvedAllowedDirs) {
        if (!this.isPathAllowed(resolvedPath, resolvedDir)) continue;
        const relative = path.relative(resolvedDir, resolvedPath);
        const segments = relative.split(path.sep);
        for (const segment of segments) {
          const clean = trimTrailingSpacesAndDots(
            segment.split(':')[0],
          ).toLowerCase();
          if (
            clean === '.git' ||
            clean === '.env' ||
            clean === 'node_modules'
          ) {
            hasBlockedSegment = true;
          }
          if (clean === '.vscode') {
            isVscodePath = true;
          }
        }
      }

      if (hasBlockedSegment) {
        return {
          decision: SafetyCheckDecision.DENY,
          reason: `Access to sensitive path "${p}" in argument "${argName}" is blocked.`,
        };
      }

      if (isVscodePath) {
        return {
          decision: SafetyCheckDecision.ASK_USER,
          reason: `Modifying .vscode configuration files requires explicit user confirmation.`,
        };
      }

      let isAllowed = false;
      for (const resolvedDir of resolvedAllowedDirs) {
        if (this.isPathAllowed(resolvedPath, resolvedDir)) {
          isAllowed = true;
          break;
        }
      }

      if (!isAllowed) {
        return {
          decision: SafetyCheckDecision.DENY,
          reason: `Path "${p}" in argument "${argName}" is outside of the allowed workspace directories.`,
        };
      }
    }

    return { decision: SafetyCheckDecision.ALLOW };
  }

  private safelyResolvePath(inputPath: string, cwd: string): string | null {
    try {
      const resolved = path.resolve(cwd, inputPath);

      // Walk up the directory tree until we find a path that exists
      let current = resolved;
      while (current && current !== path.dirname(current)) {
        try {
          const canonical = resolveToRealPath(current);
          // Re-construct the full path from this canonical base
          const relative = path.relative(current, resolved);
          // path.join handles empty relative paths correctly (returns canonical)
          return path.join(canonical, relative);
        } catch {
          // Path does not exist, continue walking up
        }
        current = path.dirname(current);
      }

      // Fallback if nothing exists (unlikely if root exists)
      return resolved;
    } catch {
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

  private collectPathsToCheck(
    args: unknown,
    includedArgs: string[],
    excludedArgs: string[],
    prefix = '',
  ): Array<{ path: string; argName: string }> {
    const paths: Array<{ path: string; argName: string }> = [];

    if (typeof args !== 'object' || args === null) {
      return paths;
    }

    for (const [key, value] of Object.entries(args)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (excludedArgs.includes(fullKey)) {
        continue;
      }

      if (typeof value === 'string') {
        if (
          includedArgs.includes(fullKey) ||
          key.includes('path') ||
          key.includes('directory') ||
          key.includes('file') ||
          key === 'source' ||
          key === 'destination'
        ) {
          paths.push({ path: value, argName: fullKey });
        }
      } else if (typeof value === 'object') {
        paths.push(
          ...this.collectPathsToCheck(
            value,
            includedArgs,
            excludedArgs,
            fullKey,
          ),
        );
      }
    }

    return paths;
  }
}

/**
 * Trims trailing spaces and dots from a string without using regular expressions
 * to completely eliminate any potential ReDoS (Regular Expression Denial of Service) risk.
 */
function trimTrailingSpacesAndDots(str: string): string {
  let end = str.length - 1;
  while (end >= 0 && (str[end] === ' ' || str[end] === '.')) {
    end--;
  }
  return str.slice(0, end + 1);
}
