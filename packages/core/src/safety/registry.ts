/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { type InProcessChecker, AllowedPathChecker } from './built-in.js';
import { InProcessCheckerType } from '../policy/types.js';

import { ConsecaSafetyChecker } from './conseca/conseca.js';

/**
 * Default trusted directories for custom safety checkers.
 * Paths outside these directories require explicit user approval.
 */
const DEFAULT_TRUSTED_CHECKER_DIRECTORIES = [
  '/usr/local/bin',
  '/usr/bin',
  '/opt/gemini-cli/checkers',
];

/**
 * Registry for managing safety checker resolution.
 */
export class CheckerRegistry {
  private static readonly BUILT_IN_EXTERNAL_CHECKERS = new Map<string, string>([
    // No external built-ins for now
  ]);

  private static BUILT_IN_IN_PROCESS_CHECKERS:
    | Map<string, InProcessChecker>
    | undefined;

  private static getBuiltInInProcessCheckers(): Map<string, InProcessChecker> {
    if (!CheckerRegistry.BUILT_IN_IN_PROCESS_CHECKERS) {
      CheckerRegistry.BUILT_IN_IN_PROCESS_CHECKERS = new Map<
        string,
        InProcessChecker
      >([
        [InProcessCheckerType.ALLOWED_PATH, new AllowedPathChecker()],
        [InProcessCheckerType.CONSECA, ConsecaSafetyChecker.getInstance()],
      ]);
    }
    return CheckerRegistry.BUILT_IN_IN_PROCESS_CHECKERS;
  }

  // Regex to validate checker names (alphanumeric and hyphens only)
  private static readonly VALID_NAME_PATTERN = /^[a-z0-9-]+$/;

  private readonly customCheckers: Map<string, string>;
  private readonly trustedCheckerDirectories: string[];
  private readonly approvedUntrustedCheckers: Set<string>;

  constructor(
    private readonly checkersPath: string,
    customCheckers?: Map<string, string>,
    trustedCheckerDirectories?: string[],
    approvedUntrustedCheckers?: Set<string>,
  ) {
    this.customCheckers = customCheckers ?? new Map<string, string>();
    this.trustedCheckerDirectories =
      trustedCheckerDirectories ?? DEFAULT_TRUSTED_CHECKER_DIRECTORIES;
    this.approvedUntrustedCheckers =
      approvedUntrustedCheckers ?? new Set<string>();
    this.validateCustomCheckerPaths();
  }

  private validateCustomCheckerPaths(): void {
    for (const [name, checkerPath] of this.customCheckers) {
      if (!path.isAbsolute(checkerPath)) {
        throw new Error(
          `Custom checker "${name}" path must be absolute: ${checkerPath}`,
        );
      }
      if (checkerPath.includes('..')) {
        throw new Error(
          `Custom checker "${name}" path must not contain '..': ${checkerPath}`,
        );
      }
      if (!fs.existsSync(checkerPath)) {
        throw new Error(`Custom checker "${name}" not found at ${checkerPath}`);
      }

      // Check if path is within a trusted directory or explicitly approved
      const isInTrustedDir = this.trustedCheckerDirectories.some((dir) =>
        checkerPath.startsWith(dir + path.sep),
      );

      if (!isInTrustedDir && !this.approvedUntrustedCheckers.has(name)) {
        throw new Error(
          `Custom checker "${name}" at ${checkerPath} is outside trusted directories. ` +
            `Add to approved list or place in one of: ${this.trustedCheckerDirectories.join(', ')}`,
        );
      }
    }
  }

  /**
   * Resolves an external checker name to an absolute executable path.
   */
  resolveExternal(name: string): string {
    if (!CheckerRegistry.isValidCheckerName(name)) {
      throw new Error(
        `Invalid checker name "${name}". Checker names must contain only lowercase letters, numbers, and hyphens.`,
      );
    }

    // Check built-in external checkers first
    const builtInPath = CheckerRegistry.BUILT_IN_EXTERNAL_CHECKERS.get(name);
    if (builtInPath) {
      const fullPath = path.join(this.checkersPath, builtInPath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Built-in checker "${name}" not found at ${fullPath}`);
      }
      // Resolve symlinks to prevent symlink substitution attacks
      return fs.realpathSync(fullPath);
    }

    // Check custom external checkers
    // Note: Paths are validated during registration in validateCustomCheckerPaths().
    // We perform additional runtime checks here for defense-in-depth.
    const customPath = this.customCheckers.get(name);
    if (customPath) {
      // Ensure path is still absolute and doesn't contain traversal sequences
      if (!path.isAbsolute(customPath) || customPath.includes('..')) {
        throw new Error(
          `Custom checker "${name}" has an invalid or untrusted path: ${customPath}`,
        );
      }
      // Resolve symlinks to prevent symlink substitution attacks
      const resolvedPath = fs.realpathSync(customPath);
      return resolvedPath;
    }

    throw new Error(
      `Unknown external checker "${name}". Available: ${this.getAllExternalCheckerNames().join(', ')}`,
    );
  }

  /**
   * Returns all available external checker names (built-in + custom).
   */
  getAllExternalCheckerNames(): string[] {
    return [
      ...Array.from(CheckerRegistry.BUILT_IN_EXTERNAL_CHECKERS.keys()),
      ...Array.from(this.customCheckers.keys()),
    ];
  }

  /**
   * Resolves an in-process checker name to a checker instance.
   */
  resolveInProcess(name: string): InProcessChecker {
    if (!CheckerRegistry.isValidCheckerName(name)) {
      throw new Error(`Invalid checker name "${name}".`);
    }

    const checker = CheckerRegistry.getBuiltInInProcessCheckers().get(name);
    if (checker) {
      return checker;
    }

    throw new Error(
      `Unknown in-process checker "${name}". Available: ${Array.from(
        CheckerRegistry.getBuiltInInProcessCheckers().keys(),
      ).join(', ')}`,
    );
  }

  private static isValidCheckerName(name: string): boolean {
    return this.VALID_NAME_PATTERN.test(name) && !name.includes('..');
  }

  static getBuiltInCheckers(): string[] {
    return [
      ...Array.from(this.BUILT_IN_EXTERNAL_CHECKERS.keys()),
      ...Array.from(this.getBuiltInInProcessCheckers().keys()),
    ];
  }

  /**
   * Returns all available checker names (built-in + custom).
   */
  getAllCheckers(): string[] {
    return [
      ...this.getAllExternalCheckerNames(),
      ...Array.from(CheckerRegistry.getBuiltInInProcessCheckers().keys()),
    ];
  }
}
