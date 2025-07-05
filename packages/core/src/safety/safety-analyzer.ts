/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { commandSafety, type CommandSafetyValue } from './command-safety-db.js';

export type SafetyLevel = 'safe' | 'requires-approval' | 'dangerous';
export type ExtendedSafetyLevel = SafetyLevel | 'analyze-nested-command';

/**
 * Simple shell command parser that handles basic quoting
 * This is a minimal implementation - for production use, consider using
 * a library like 'shell-quote' or 'shell-parse'
 */
function parseShellCommand(command: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

/**
 * Analyzes a command string and returns its safety level
 * @param command - The full command string to analyze
 * @returns SafetyLevel indicating how the command should be handled
 */
export function analyzeSafety(command: string): SafetyLevel {
  if (!command || command.trim().length === 0) {
    return 'requires-approval';
  }

  // This is a simplified splitter and doesn't handle complex cases
  // like escaped separators or separators within quotes.
  const subCommands = command.split(/&&|\|\||;|\|/);
  if (subCommands.length > 1) {
    let overallSafety: SafetyLevel = 'safe';
    for (const sub of subCommands) {
      if (sub.trim() === '') continue;
      const subSafety = analyzeSafety(sub); // Recurse for each subcommand
      overallSafety = getMostRestrictiveSafetyLevel(overallSafety, subSafety);
    }
    // Run heuristic checks on the full command string as well to catch pipes.
    return performAdditionalSafetyChecks(command, overallSafety);
  }

  const trimmedCommand = command.trim();

  // Use proper shell parsing instead of simple split
  const parts = parseShellCommand(trimmedCommand);

  if (parts.length === 0) {
    return 'requires-approval';
  }

  const mainCommand = parts[0];
  const args = parts.slice(1);
  const flags = parts.filter((part) => part.startsWith('-'));

  // Check if main command exists in database
  const commandConfig = commandSafety[mainCommand];
  if (!commandConfig) {
    // Unknown commands require approval by default
    return 'requires-approval';
  }

  // If it's a simple string safety level, return it
  if (typeof commandConfig === 'string') {
    if (commandConfig === 'analyze-nested-command') {
      return analyzeNestedCommand(parts);
    }
    return commandConfig as SafetyLevel;
  }

  // Handle nested command structure
  let safetyLevel = analyzeNestedStructure(commandConfig, args, flags);

  // Additional safety checks on the single command part
  safetyLevel = performAdditionalSafetyChecks(trimmedCommand, safetyLevel);

  return safetyLevel;
}

/**
 * Analyzes nested command structures (objects with subcommands/flags)
 */
function analyzeNestedStructure(
  config: CommandSafetyValue,
  args: string[],
  flags: string[],
): SafetyLevel {
  if (typeof config === 'string') {
    if (config === 'analyze-nested-command') {
      return 'requires-approval'; // fallback
    }
    return config as SafetyLevel;
  }

  let safetyLevel: SafetyLevel = 'safe';
  let foundMatch = false;

  // Check subcommands first (for commands like 'git status')
  if (args.length > 0) {
    const subCommand = args[0];
    const subConfig = config[subCommand];

    if (subConfig !== undefined) {
      foundMatch = true;
      if (typeof subConfig === 'string') {
        if (subConfig === 'analyze-nested-command') {
          return analyzeNestedCommand([subCommand, ...args.slice(1)]);
        }
        safetyLevel = subConfig as SafetyLevel;
      } else {
        // Recursively analyze nested subcommand
        safetyLevel = analyzeNestedStructure(subConfig, args.slice(1), flags);
      }
    }
  }

  // Check flags for safety overrides (flags can make commands more dangerous)
  for (const flag of flags) {
    const flagConfig = config[flag];
    if (flagConfig !== undefined) {
      foundMatch = true;
      let flagSafety: SafetyLevel;

      if (typeof flagConfig === 'string') {
        if (flagConfig === 'analyze-nested-command') {
          flagSafety = 'requires-approval';
        } else {
          flagSafety = flagConfig as SafetyLevel;
        }
      } else {
        // For nested flag configs, use wildcard or default
        const wildcardConfig = flagConfig['*'];
        if (
          typeof wildcardConfig === 'string' &&
          wildcardConfig !== 'analyze-nested-command'
        ) {
          flagSafety = wildcardConfig as SafetyLevel;
        } else {
          flagSafety = 'requires-approval';
        }
      }

      // Use the most restrictive safety level
      safetyLevel = getMostRestrictiveSafetyLevel(safetyLevel, flagSafety);
    }
  }

  // If no specific match found, use wildcard default
  if (!foundMatch) {
    const wildcardConfig = config['*'];
    if (wildcardConfig !== undefined) {
      if (typeof wildcardConfig === 'string') {
        if (wildcardConfig === 'analyze-nested-command') {
          return analyzeNestedCommand(args);
        }
        return wildcardConfig as SafetyLevel;
      }
    }
    // No wildcard found, default to requires-approval
    return 'requires-approval';
  }

  return safetyLevel;
}

/**
 * Analyzes nested commands like 'timeout 30 ls' or 'xargs rm'
 */
function analyzeNestedCommand(parts: string[]): SafetyLevel {
  if (parts.length === 0) {
    return 'requires-approval';
  }

  const mainCommand = parts[0];

  if (mainCommand === 'timeout') {
    // For timeout, analyze the actual command after the timeout value
    // Format: timeout [duration] [command...]
    if (parts.length >= 3) {
      const nestedCommand = parts.slice(2).join(' ');
      return analyzeSafety(nestedCommand);
    }
    return 'requires-approval';
  }

  if (mainCommand === 'xargs') {
    // For xargs, analyze the command being executed
    // Format: xargs [options] [command]
    const commandIndex = parts.findIndex(
      (part, index) => index > 0 && !part.startsWith('-'),
    );
    if (commandIndex > 0 && commandIndex < parts.length) {
      const nestedCommand = parts.slice(commandIndex).join(' ');
      // xargs makes any command potentially more dangerous due to batch execution
      const nestedSafety = analyzeSafety(nestedCommand);
      return escalateSafetyLevel(nestedSafety);
    }
    return 'requires-approval';
  }

  if (mainCommand === 'watch') {
    // For watch, analyze the command being watched
    // Format: watch [options] [command]
    const commandIndex = parts.findIndex(
      (part, index) => index > 0 && !part.startsWith('-'),
    );
    if (commandIndex > 0 && commandIndex < parts.length) {
      const nestedCommand = parts.slice(commandIndex).join(' ');
      // watch is generally safe as it just repeats commands
      return analyzeSafety(nestedCommand);
    }
    return 'requires-approval';
  }

  return 'requires-approval';
}

/**
 * Performs additional heuristic safety checks
 */
function performAdditionalSafetyChecks(
  command: string,
  currentSafety: SafetyLevel,
): SafetyLevel {
  // Check for dangerous patterns
  const dangerousPatterns = [
    /rm\s+.*-r.*\//, // recursive delete with paths
    /rm\s+.*-f.*\*/, // force delete with wildcards
    /sudo\s+.*rm/, // sudo + rm combination
    /chmod\s+777/, // overly permissive permissions
    /\|\s*sh/, // piping to shell
    /curl.*\|\s*bash/, // downloading and executing scripts
    /wget.*\|\s*bash/, // downloading and executing scripts
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return 'dangerous';
    }
  }

  // Check for system directories with destructive commands
  const systemPaths = ['/', '/usr', '/etc', '/var', '/sys', '/proc', '/boot'];
  const destructiveCommands = ['rm', 'del', 'rmdir', 'shred'];

  for (const path of systemPaths) {
    for (const cmd of destructiveCommands) {
      const cmdPattern = new RegExp(`\\b${cmd}\\b`);
      if (cmdPattern.test(command) && command.includes(path)) {
        return 'dangerous';
      }
    }
  }

  // Check for potential data loss commands with force flags
  if (command.includes('--force') || command.includes('-f')) {
    const destructivePatterns = [/rm/, /delete/, /del/];
    for (const pattern of destructivePatterns) {
      if (pattern.test(command)) {
        return escalateSafetyLevel(currentSafety);
      }
    }
  }

  // Check for output redirection to /dev/null (might hide important warnings)
  if (/>\s*\/dev\/null/.test(command)) {
    // Only escalate if current level is 'safe'
    if (currentSafety === 'safe') {
      return 'requires-approval';
    }
  }

  return currentSafety;
}

/**
 * Returns the most restrictive safety level between two levels
 */
function getMostRestrictiveSafetyLevel(
  level1: SafetyLevel,
  level2: SafetyLevel,
): SafetyLevel {
  const hierarchy: Record<SafetyLevel, number> = {
    safe: 0,
    'requires-approval': 1,
    dangerous: 2,
  };

  return hierarchy[level1] >= hierarchy[level2] ? level1 : level2;
}

/**
 * Escalates a safety level to the next more restrictive level
 */
function escalateSafetyLevel(currentLevel: SafetyLevel): SafetyLevel {
  switch (currentLevel) {
    case 'safe':
      return 'requires-approval';
    case 'requires-approval':
      return 'dangerous';
    case 'dangerous':
      return 'dangerous'; // Already at max restriction
    default:
      return 'requires-approval';
  }
}

/**
 * Helper function to get a human-readable description of the safety level
 */
export function getSafetyDescription(level: SafetyLevel): string {
  switch (level) {
    case 'safe':
      return 'Safe to execute automatically';
    case 'requires-approval':
      return 'Requires user approval before execution';
    case 'dangerous':
      return 'Dangerous operation - requires explicit confirmation';
    default:
      return 'Unknown safety level';
  }
}

/**
 * Validates if a command should be auto-approved based on configuration
 */
export function shouldAutoApprove(
  command: string,
  autoApproveEnabled: boolean = true,
): boolean {
  if (!autoApproveEnabled) {
    return false;
  }

  const safetyLevel = analyzeSafety(command);
  return safetyLevel === 'safe';
}
