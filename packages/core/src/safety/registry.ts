/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { type InProcessChecker, AllowedPathChecker } from './built-in.js';
import { InProcessCheckerType } from '../policy/types.js';

/**
 * Registry for managing safety checker resolution.
 */
export class CheckerRegistry {
  private static readonly BUILT_IN_EXTERNAL_CHECKERS = new Map<string, string>([
    // No external built-ins for now
  ]);

  private static readonly BUILT_IN_IN_PROCESS_CHECKERS = new Map<
    string,
    InProcessChecker
  >([[InProcessCheckerType.ALLOWED_PATH, new AllowedPathChecker()]]);

  // Regex to validate checker names (alphanumeric and hyphens only)
  private static readonly VALID_NAME_PATTERN = /^[a-z0-9-]+$/;

  constructor(private readonly checkersPath: string) {}

  /**
   * Resolves an external checker name to an absolute executable path.
   */
  resolveExternal(name: string): string {
    if (!CheckerRegistry.isValidCheckerName(name)) {
      throw new Error(
        `Invalid checker name "${name}". Checker names must contain only lowercase letters, numbers, and hyphens.`,
      );
    }

    const builtInPath = CheckerRegistry.BUILT_IN_EXTERNAL_CHECKERS.get(name);
    if (builtInPath) {
      const fullPath = path.join(this.checkersPath, builtInPath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Built-in checker "${name}" not found at ${fullPath}`);
      }
      return fullPath;
    }

    // TODO: Phase 5 - Add support for custom external checkers
    throw new Error(`Unknown external checker "${name}".`);
  }

  /**
   * Resolves an in-process checker name to a checker instance.
   */
  resolveInProcess(name: string): InProcessChecker {
    if (!CheckerRegistry.isValidCheckerName(name)) {
      throw new Error(`Invalid checker name "${name}".`);
    }

    const checker = CheckerRegistry.BUILT_IN_IN_PROCESS_CHECKERS.get(name);
    if (checker) {
      return checker;
    }

    throw new Error(
      `Unknown in-process checker "${name}". Available: ${Array.from(
        CheckerRegistry.BUILT_IN_IN_PROCESS_CHECKERS.keys(),
      ).join(', ')}`,
    );
  }

  private static isValidCheckerName(name: string): boolean {
    return this.VALID_NAME_PATTERN.test(name) && !name.includes('..');
  }

  static getBuiltInCheckers(): string[] {
    return [
      ...Array.from(this.BUILT_IN_EXTERNAL_CHECKERS.keys()),
      ...Array.from(this.BUILT_IN_IN_PROCESS_CHECKERS.keys()),
    ];
  }
}
