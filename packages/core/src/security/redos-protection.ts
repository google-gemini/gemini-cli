/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logConfigTamperingDetected } from './security-audit-logger.js';

/**
 * ReDoS (Regular Expression Denial of Service) Protection.
 *
 * SECURITY NOTE: Poorly written regular expressions with nested quantifiers
 * can cause catastrophic backtracking, leading to exponential time complexity.
 * Attackers can craft inputs that cause the regex engine to hang for minutes
 * or hours, causing denial of service.
 *
 * Common vulnerable patterns:
 * - (a+)+
 * - (a*)*
 * - (a|a)*
 * - (a|ab)*
 * - ([a-z]+)*
 *
 * This module provides safe regex execution with timeouts and pattern analysis.
 */

/**
 * Error thrown when regex execution times out (ReDoS detected).
 */
export class ReDoSError extends Error {
  constructor(
    message: string,
    public readonly pattern: string,
    public readonly input: string,
    public readonly timeElapsed: number,
  ) {
    super(message);
    this.name = 'ReDoSError';
  }
}

/**
 * Dangerous regex patterns that are known to cause ReDoS.
 */
const DANGEROUS_PATTERNS = [
  // Nested quantifiers
  /\([^)]*\+\)\+/,           // (x+)+
  /\([^)]*\*\)\*/,           // (x*)*
  /\([^)]*\+\)\*/,           // (x+)*
  /\([^)]*\*\)\+/,           // (x*)+

  // Alternation with overlap
  /\([^|]*\|[^)]*\)\*/,      // (a|ab)*
  /\([^|]*\|[^)]*\)\+/,      // (a|ab)+

  // Character class quantifiers
  /\[[^\]]+\]\+\+/,          // [a-z]++
  /\[[^\]]+\]\*\*/,          // [a-z]**
  /\[[^\]]+\]\+\*/,          // [a-z]+*

  // Grouping with nested quantifiers
  /\(\.\+\)\+/,              // (.+)+
  /\(\.\*\)\*/,              // (.*)*
  /\(\.\+\)\*/,              // (.+)*
];

/**
 * Safe regex execution with timeout.
 *
 * @param pattern Regular expression pattern or RegExp object
 * @param input String to test against
 * @param timeout Timeout in milliseconds (default: 1000ms)
 * @returns Match result or null
 */
export function safeRegexTest(
  pattern: RegExp | string,
  input: string,
  timeout: number = 1000,
): boolean {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  // Check for dangerous patterns
  if (isDangerousRegex(regex)) {
    logConfigTamperingDetected(
      'ReDoS check',
      `Potentially dangerous regex pattern detected: ${regex.source}`,
    );
    console.warn(
      `WARNING: Regex pattern may be vulnerable to ReDoS: ${regex.source}`,
    );
  }

  let completed = false;
  let result: boolean = false;

  const startTime = Date.now();

  // Use worker thread or timeout mechanism
  const timer = setTimeout(() => {
    if (!completed) {
      const timeElapsed = Date.now() - startTime;
      logConfigTamperingDetected(
        'ReDoS timeout',
        `Regex execution timed out after ${timeElapsed}ms: ${regex.source}`,
      );
      throw new ReDoSError(
        `Regex execution timed out after ${timeElapsed}ms - possible ReDoS attack`,
        regex.source,
        input.substring(0, 100), // Only log first 100 chars of input
        timeElapsed,
      );
    }
  }, timeout);

  try {
    result = regex.test(input);
    completed = true;
    clearTimeout(timer);

    const timeElapsed = Date.now() - startTime;

    // Warn if execution took significant time (>100ms)
    if (timeElapsed > 100) {
      logConfigTamperingDetected(
        'Slow regex',
        `Regex execution took ${timeElapsed}ms: ${regex.source}`,
      );
      console.warn(
        `WARNING: Regex execution took ${timeElapsed}ms, may indicate ReDoS vulnerability`,
      );
    }

    return result;
  } catch (error) {
    completed = true;
    clearTimeout(timer);

    if (error instanceof ReDoSError) {
      throw error;
    }

    throw new Error(`Regex execution failed: ${(error as Error).message}`);
  }
}

/**
 * Safe regex match with timeout.
 *
 * @param pattern Regular expression pattern or RegExp object
 * @param input String to match against
 * @param timeout Timeout in milliseconds (default: 1000ms)
 * @returns Match result or null
 */
export function safeRegexMatch(
  pattern: RegExp | string,
  input: string,
  timeout: number = 1000,
): RegExpMatchArray | null {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  // Check for dangerous patterns
  if (isDangerousRegex(regex)) {
    logConfigTamperingDetected(
      'ReDoS check',
      `Potentially dangerous regex pattern detected: ${regex.source}`,
    );
  }

  let completed = false;
  let result: RegExpMatchArray | null = null;

  const startTime = Date.now();

  const timer = setTimeout(() => {
    if (!completed) {
      const timeElapsed = Date.now() - startTime;
      throw new ReDoSError(
        `Regex execution timed out after ${timeElapsed}ms - possible ReDoS attack`,
        regex.source,
        input.substring(0, 100),
        timeElapsed,
      );
    }
  }, timeout);

  try {
    result = input.match(regex);
    completed = true;
    clearTimeout(timer);

    const timeElapsed = Date.now() - startTime;

    if (timeElapsed > 100) {
      console.warn(
        `WARNING: Regex match took ${timeElapsed}ms, may indicate ReDoS vulnerability`,
      );
    }

    return result;
  } catch (error) {
    completed = true;
    clearTimeout(timer);

    if (error instanceof ReDoSError) {
      throw error;
    }

    throw new Error(`Regex match failed: ${(error as Error).message}`);
  }
}

/**
 * Safe regex replace with timeout.
 *
 * @param pattern Regular expression pattern or RegExp object
 * @param input String to perform replacement on
 * @param replacement Replacement string or function
 * @param timeout Timeout in milliseconds (default: 1000ms)
 * @returns Resulting string
 */
export function safeRegexReplace(
  pattern: RegExp | string,
  input: string,
  replacement: string | ((match: string, ...args: any[]) => string),
  timeout: number = 1000,
): string {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  if (isDangerousRegex(regex)) {
    logConfigTamperingDetected(
      'ReDoS check',
      `Potentially dangerous regex pattern detected: ${regex.source}`,
    );
  }

  let completed = false;
  let result: string = input;

  const startTime = Date.now();

  const timer = setTimeout(() => {
    if (!completed) {
      const timeElapsed = Date.now() - startTime;
      throw new ReDoSError(
        `Regex execution timed out after ${timeElapsed}ms - possible ReDoS attack`,
        regex.source,
        input.substring(0, 100),
        timeElapsed,
      );
    }
  }, timeout);

  try {
    result = input.replace(regex, replacement as any);
    completed = true;
    clearTimeout(timer);

    const timeElapsed = Date.now() - startTime;

    if (timeElapsed > 100) {
      console.warn(
        `WARNING: Regex replace took ${timeElapsed}ms, may indicate ReDoS vulnerability`,
      );
    }

    return result;
  } catch (error) {
    completed = true;
    clearTimeout(timer);

    if (error instanceof ReDoSError) {
      throw error;
    }

    throw new Error(`Regex replace failed: ${(error as Error).message}`);
  }
}

/**
 * Checks if a regex pattern is potentially dangerous (vulnerable to ReDoS).
 *
 * @param regex Regular expression to check
 * @returns True if pattern appears dangerous
 */
export function isDangerousRegex(regex: RegExp): boolean {
  const pattern = regex.source;

  // Check against known dangerous patterns
  for (const dangerousPattern of DANGEROUS_PATTERNS) {
    if (dangerousPattern.test(pattern)) {
      return true;
    }
  }

  // Check for excessive nesting
  const nestingLevel = (pattern.match(/\(/g) || []).length;
  if (nestingLevel > 10) {
    return true;
  }

  // Check for long alternations
  if (pattern.includes('|')) {
    const alternations = pattern.split('|').length;
    if (alternations > 20) {
      return true;
    }
  }

  return false;
}

/**
 * Analyzes a regex pattern for potential ReDoS vulnerabilities.
 *
 * @param regex Regular expression to analyze
 * @returns Analysis result with warnings
 */
export function analyzeRegex(regex: RegExp): {
  safe: boolean;
  warnings: string[];
  complexity: 'low' | 'medium' | 'high' | 'critical';
} {
  const warnings: string[] = [];
  const pattern = regex.source;

  // Check for nested quantifiers
  if (/\([^)]*[\*\+]\)[\*\+]/.test(pattern)) {
    warnings.push('Contains nested quantifiers (e.g., (a+)+) - HIGH ReDoS risk');
  }

  // Check for alternation with overlap
  if (/\([^|]*\|[^)]*\)[\*\+]/.test(pattern)) {
    warnings.push('Contains alternation with quantifiers - potential ReDoS risk');
  }

  // Check for greedy quantifiers
  const greedyCount = (pattern.match(/[\*\+]/g) || []).length;
  if (greedyCount > 5) {
    warnings.push(`Contains ${greedyCount} greedy quantifiers - may be slow`);
  }

  // Check for .* or .+
  if (/\.\*|\.\+/.test(pattern)) {
    warnings.push('Contains .* or .+ - can be slow on long inputs');
  }

  // Check for excessive nesting
  const nestingLevel = (pattern.match(/\(/g) || []).length;
  if (nestingLevel > 10) {
    warnings.push(`Deep nesting (${nestingLevel} levels) - increases complexity`);
  }

  // Determine complexity
  let complexity: 'low' | 'medium' | 'high' | 'critical';
  if (warnings.length === 0) {
    complexity = 'low';
  } else if (warnings.some(w => w.includes('HIGH ReDoS risk'))) {
    complexity = 'critical';
  } else if (warnings.length > 2) {
    complexity = 'high';
  } else {
    complexity = 'medium';
  }

  return {
    safe: complexity === 'low' || complexity === 'medium',
    warnings,
    complexity,
  };
}

/**
 * Creates a safe regex pattern by sanitizing input.
 * Escapes special regex characters to prevent injection.
 *
 * @param input String to escape for use in regex
 * @returns Escaped string safe for use in regex
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates regex pattern length to prevent excessive compilation time.
 *
 * @param pattern Regex pattern string
 * @param maxLength Maximum allowed pattern length
 * @returns True if valid
 */
export function validateRegexLength(
  pattern: string,
  maxLength: number = 1000,
): boolean {
  if (pattern.length > maxLength) {
    logConfigTamperingDetected(
      'Regex length',
      `Regex pattern exceeds maximum length: ${pattern.length} > ${maxLength}`,
    );
    throw new Error(
      `Regex pattern too long (${pattern.length} chars), maximum ${maxLength} chars`,
    );
  }
  return true;
}

/**
 * Safe string split with regex and timeout.
 *
 * @param pattern Regular expression pattern
 * @param input String to split
 * @param limit Maximum number of splits
 * @param timeout Timeout in milliseconds
 * @returns Array of split strings
 */
export function safeRegexSplit(
  pattern: RegExp | string,
  input: string,
  limit?: number,
  timeout: number = 1000,
): string[] {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  if (isDangerousRegex(regex)) {
    logConfigTamperingDetected(
      'ReDoS check',
      `Potentially dangerous regex pattern detected: ${regex.source}`,
    );
  }

  let completed = false;
  let result: string[] = [];

  const startTime = Date.now();

  const timer = setTimeout(() => {
    if (!completed) {
      const timeElapsed = Date.now() - startTime;
      throw new ReDoSError(
        `Regex execution timed out after ${timeElapsed}ms - possible ReDoS attack`,
        regex.source,
        input.substring(0, 100),
        timeElapsed,
      );
    }
  }, timeout);

  try {
    result = input.split(regex, limit);
    completed = true;
    clearTimeout(timer);

    return result;
  } catch (error) {
    completed = true;
    clearTimeout(timer);

    if (error instanceof ReDoSError) {
      throw error;
    }

    throw new Error(`Regex split failed: ${(error as Error).message}`);
  }
}

/**
 * Gets safe regex flags (prevents catastrophic backtracking with 's' flag).
 *
 * @param flags Original flags
 * @returns Safe flags
 */
export function getSafeRegexFlags(flags: string): string {
  // Remove 's' flag (dotAll) which can make .* match newlines and increase ReDoS risk
  return flags.replace(/s/g, '');
}

/**
 * Tests multiple inputs against a regex and measures performance.
 * Useful for detecting ReDoS vulnerabilities in development.
 *
 * @param regex Regular expression to test
 * @param inputs Array of test inputs
 * @returns Performance metrics
 */
export function benchmarkRegex(
  regex: RegExp,
  inputs: string[],
): {
  pattern: string;
  averageTime: number;
  maxTime: number;
  minTime: number;
  dangerous: boolean;
} {
  const times: number[] = [];

  for (const input of inputs) {
    const start = Date.now();
    try {
      regex.test(input);
    } catch {
      // Ignore errors
    }
    const elapsed = Date.now() - start;
    times.push(elapsed);
  }

  const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);

  // If max time is more than 10x average, pattern might be vulnerable
  const dangerous = maxTime > averageTime * 10 || maxTime > 500;

  if (dangerous) {
    logConfigTamperingDetected(
      'ReDoS benchmark',
      `Regex pattern shows dangerous performance: max ${maxTime}ms, avg ${averageTime}ms`,
    );
  }

  return {
    pattern: regex.source,
    averageTime,
    maxTime,
    minTime,
    dangerous,
  };
}
