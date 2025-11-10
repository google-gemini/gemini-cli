/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandValidationError, ValidationErrorType } from './command-validator.js';
import { logDangerousArgumentBlocked } from './security-audit-logger.js';

/**
 * Advanced argument validation for detecting dangerous flag patterns.
 *
 * SECURITY NOTE: Many interpreters and tools have flags that can execute
 * arbitrary code (--eval, -c, etc.). This module detects these patterns.
 */

/**
 * Dangerous argument patterns by command.
 * Maps command names to their dangerous flags.
 */
const DANGEROUS_ARGUMENT_PATTERNS: Record<string, DangerousArgumentPattern[]> =
  {
    node: [
      {
        flags: ['-e', '--eval'],
        description: 'executes arbitrary JavaScript code',
        severity: 'CRITICAL',
      },
      {
        flags: ['--eval-print'],
        description: 'executes and prints JavaScript code',
        severity: 'CRITICAL',
      },
      {
        flags: ['-p', '--print'],
        description: 'evaluates and prints expression',
        severity: 'HIGH',
      },
      {
        flags: ['-r', '--require'],
        description: 'can load malicious modules',
        severity: 'HIGH',
      },
    ],
    python: [
      {
        flags: ['-c'],
        description: 'executes arbitrary Python code',
        severity: 'CRITICAL',
      },
      {
        flags: ['-m'],
        description: 'runs arbitrary Python modules',
        severity: 'HIGH',
      },
    ],
    python3: [
      {
        flags: ['-c'],
        description: 'executes arbitrary Python code',
        severity: 'CRITICAL',
      },
      {
        flags: ['-m'],
        description: 'runs arbitrary Python modules',
        severity: 'HIGH',
      },
    ],
    ruby: [
      {
        flags: ['-e'],
        description: 'executes arbitrary Ruby code',
        severity: 'CRITICAL',
      },
    ],
    perl: [
      {
        flags: ['-e'],
        description: 'executes arbitrary Perl code',
        severity: 'CRITICAL',
      },
      {
        flags: ['-E'],
        description: 'executes arbitrary Perl code with features',
        severity: 'CRITICAL',
      },
    ],
    php: [
      {
        flags: ['-r'],
        description: 'executes arbitrary PHP code',
        severity: 'CRITICAL',
      },
    ],
    bash: [
      {
        flags: ['-c'],
        description: 'executes arbitrary shell commands',
        severity: 'CRITICAL',
      },
    ],
    sh: [
      {
        flags: ['-c'],
        description: 'executes arbitrary shell commands',
        severity: 'CRITICAL',
      },
    ],
    zsh: [
      {
        flags: ['-c'],
        description: 'executes arbitrary shell commands',
        severity: 'CRITICAL',
      },
    ],
    powershell: [
      {
        flags: ['-Command', '-C'],
        description: 'executes arbitrary PowerShell commands',
        severity: 'CRITICAL',
      },
      {
        flags: ['-EncodedCommand', '-E', '-EC'],
        description: 'executes base64-encoded commands',
        severity: 'CRITICAL',
      },
    ],
    pwsh: [
      {
        flags: ['-Command', '-C'],
        description: 'executes arbitrary PowerShell commands',
        severity: 'CRITICAL',
      },
      {
        flags: ['-EncodedCommand', '-E', '-EC'],
        description: 'executes base64-encoded commands',
        severity: 'CRITICAL',
      },
    ],
    cmd: [
      {
        flags: ['/c', '/C'],
        description: 'executes arbitrary commands',
        severity: 'CRITICAL',
      },
      {
        flags: ['/k', '/K'],
        description: 'executes commands and remains open',
        severity: 'HIGH',
      },
    ],
    curl: [
      {
        flags: ['--output', '-o'],
        description: 'can overwrite system files',
        severity: 'HIGH',
        requiresSuspiciousValue: true,
      },
      {
        flags: ['--config'],
        description: 'can load malicious configuration',
        severity: 'HIGH',
      },
    ],
    wget: [
      {
        flags: ['--output-document', '-O'],
        description: 'can overwrite system files',
        severity: 'HIGH',
        requiresSuspiciousValue: true,
      },
      {
        flags: ['--execute', '-e'],
        description: 'executes arbitrary commands',
        severity: 'CRITICAL',
      },
    ],
  };

interface DangerousArgumentPattern {
  flags: string[];
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  requiresSuspiciousValue?: boolean;
}

/**
 * Suspicious file paths that should not be written to.
 */
const SUSPICIOUS_OUTPUT_PATHS = [
  '/etc/',
  '/bin/',
  '/sbin/',
  '/usr/bin/',
  '/usr/sbin/',
  '/System/',
  'C:\\Windows\\',
  'C:\\Program Files\\',
  '/var/',
  '/tmp/',
];

/**
 * Validates command arguments for dangerous patterns.
 *
 * @param command The command being executed
 * @param args The arguments to validate
 * @param options Validation options
 * @throws CommandValidationError if dangerous arguments are detected
 */
export function validateArguments(
  command: string,
  args: string[],
  options: {
    trusted?: boolean;
    serverName?: string;
  } = {},
): void {
  // Skip validation if trusted
  if (options.trusted) {
    return;
  }

  // Extract command basename (handle paths and extensions)
  const commandBasename = command
    .split(/[/\\]/)
    .pop()!
    .toLowerCase()
    .replace(/\.(exe|bat|cmd|sh)$/, '');

  const patterns = DANGEROUS_ARGUMENT_PATTERNS[commandBasename];
  if (!patterns) {
    return; // No dangerous patterns defined for this command
  }

  // Check each argument against dangerous patterns
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    for (const pattern of patterns) {
      // Check if this argument matches a dangerous flag
      const matchedFlag = pattern.flags.find((flag) =>
        arg.toLowerCase().startsWith(flag.toLowerCase()),
      );

      if (!matchedFlag) {
        continue;
      }

      // If the pattern requires checking the value
      if (pattern.requiresSuspiciousValue) {
        // Get the value (either after = or in next argument)
        let value: string | undefined;
        if (arg.includes('=')) {
          value = arg.split('=', 2)[1];
        } else if (i + 1 < args.length) {
          value = args[i + 1];
        }

        // Check if value points to suspicious location
        if (value && isSuspiciousPath(value)) {
          const errorMsg =
            `Argument '${matchedFlag}' ${pattern.description} and is pointing to ` +
            `a suspicious system location: '${value}'. ` +
            `If you trust this MCP server, add the --trust flag.`;

          logDangerousArgumentBlocked(
            arg,
            errorMsg,
            options.serverName,
          );

          throw new CommandValidationError(
            ValidationErrorType.DANGEROUS_COMMAND,
            errorMsg,
            command,
          );
        }
      } else {
        // Flag is always dangerous
        const errorMsg =
          `Argument '${matchedFlag}' ${pattern.description}. This is blocked ` +
          `for security. If you trust this MCP server, add the --trust flag.`;

        logDangerousArgumentBlocked(
          arg,
          errorMsg,
          options.serverName,
        );

        throw new CommandValidationError(
          ValidationErrorType.DANGEROUS_COMMAND,
          errorMsg,
          command,
        );
      }
    }
  }
}

/**
 * Checks if a path is suspicious (system directories, etc.)
 */
function isSuspiciousPath(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return SUSPICIOUS_OUTPUT_PATHS.some((suspiciousPath) =>
    normalizedPath.startsWith(suspiciousPath),
  );
}

/**
 * Gets information about dangerous arguments for a command.
 * Useful for displaying help/warnings to users.
 */
export function getDangerousArgumentInfo(
  command: string,
): DangerousArgumentPattern[] | null {
  const commandBasename = command
    .split(/[/\\]/)
    .pop()!
    .toLowerCase()
    .replace(/\.(exe|bat|cmd|sh)$/, '');

  return DANGEROUS_ARGUMENT_PATTERNS[commandBasename] || null;
}

/**
 * Checks if a command has any dangerous argument patterns defined.
 */
export function hasDangerousArguments(command: string): boolean {
  return getDangerousArgumentInfo(command) !== null;
}
