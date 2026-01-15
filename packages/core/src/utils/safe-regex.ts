/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vm from 'node:vm';
import { debugLogger } from './debugLogger.js';

/**
 * Safely executes a regex test against an input string using a VM sandbox with a timeout.
 * This prevents Regular Expression Denial of Service (ReDoS) attacks from user-supplied regexes.
 */
export function safeRegexTest(
  pattern: RegExp,
  input: string,
  timeoutMs: number = 100,
): boolean {
  try {
    const context = vm.createContext({
      regexSource: pattern.source,
      regexFlags: pattern.flags,
      input,
      result: false,
    });

    vm.runInContext(
      'const regex = new RegExp(regexSource, regexFlags); result = regex.test(input);',
      context,
      { timeout: timeoutMs },
    );

    return context['result'] as boolean;
  } catch (error) {
    debugLogger.debug(
      `[safeRegexTest] Regex execution failed or timed out: ${error}`,
    );
    return false;
  }
}
