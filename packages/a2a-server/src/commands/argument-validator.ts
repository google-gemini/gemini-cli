/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Argument validation for /executeCommand endpoint.
 *
 * Implements allowlist-based validation to prevent argument injection attacks.
 * Each registered command has explicit validation rules for its arguments.
 */

export interface CommandValidationResult {
  valid: boolean;
  error?: string;
}

// Maximum limits to prevent DoS
const MAX_ARGS_COUNT = 100;
const MAX_ARG_LENGTH = 100 * 1024; // 100KB per argument
const MAX_MEMORY_TEXT_LENGTH = 10 * 1024; // 10KB for memory add

/**
 * Validates command name to prevent injection at the command level.
 * Command names must be alphanumeric with spaces or hyphens only.
 */
function isValidCommandName(command: string): boolean {
  if (!command || typeof command !== 'string') {
    return false;
  }

  // Check for null bytes
  if (command.includes('\0')) {
    return false;
  }

  // Command names should only contain alphanumeric, spaces, and hyphens
  // Examples: "memory add", "restore", "extensions list"
  const validCommandPattern = /^[a-zA-Z][a-zA-Z0-9 -]*$/;
  return validCommandPattern.test(command);
}

/**
 * Validates that a string doesn't contain control characters or null bytes.
 */
function hasControlCharacters(str: string): boolean {
  // Check for null bytes
  if (str.includes('\0')) {
    return true;
  }

  // Check for control characters (ASCII 0-31 except tab, newline, carriage return)
  // We allow \t (9), \n (10), \r (13) as they're common in text
  // eslint-disable-next-line no-control-regex
  const controlCharPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
  return controlCharPattern.test(str);
}

/**
 * Validates that a string doesn't contain shell metacharacters.
 * Used for additional safety even though we use spawn without shell.
 */
function hasShellMetacharacters(str: string): boolean {
  const shellMetaPattern = /[;&|`$<>(){}[\]*?'"\\!]/;
  return shellMetaPattern.test(str);
}

/**
 * Validates that a string doesn't contain path traversal sequences.
 */
function hasPathTraversal(str: string): boolean {
  // Check for .. sequences and absolute paths
  return str.includes('..') || str.startsWith('/') || /^[A-Za-z]:/.test(str);
}

/**
 * Validates checkpoint filename for the restore command.
 * Must be alphanumeric with dashes/underscores, optionally ending in .json
 */
function isValidCheckpointName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // Check length
  if (name.length > 255) {
    return false;
  }

  // Pattern: alphanumeric, dash, underscore, optionally .json extension
  const checkpointPattern = /^[a-zA-Z0-9_-]+(?:\.json)?$/;
  if (!checkpointPattern.test(name)) {
    return false;
  }

  // Double-check no path traversal
  if (hasPathTraversal(name)) {
    return false;
  }

  return true;
}

/**
 * Validates text content for the memory add command.
 * Allows alphanumeric and common punctuation, but no control characters.
 */
function isValidMemoryText(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  // Check length limit
  if (text.length > MAX_MEMORY_TEXT_LENGTH) {
    return false;
  }

  // No control characters allowed
  if (hasControlCharacters(text)) {
    return false;
  }

  // For extra safety, reject shell metacharacters
  // Memory text is later passed to tools, so we need to be careful
  if (hasShellMetacharacters(text)) {
    return false;
  }

  return true;
}

/**
 * Validates arguments for a specific command using allowlist rules.
 */
function validateCommandArguments(
  command: string,
  args: string[],
): CommandValidationResult {
  // Validate args count
  if (args.length > MAX_ARGS_COUNT) {
    return {
      valid: false,
      error: `Too many arguments (max ${MAX_ARGS_COUNT})`,
    };
  }

  // Validate individual arg lengths
  for (const arg of args) {
    if (typeof arg !== 'string') {
      return {
        valid: false,
        error: 'All arguments must be strings',
      };
    }

    if (arg.length > MAX_ARG_LENGTH) {
      return {
        valid: false,
        error: `Argument too long (max ${MAX_ARG_LENGTH} bytes)`,
      };
    }
  }

  // Command-specific validation
  switch (command) {
    case 'memory':
    case 'memory show':
      // No arguments allowed
      if (args.length > 0) {
        return {
          valid: false,
          error: 'Command "memory show" does not accept arguments',
        };
      }
      return { valid: true };

    case 'memory list':
      // No arguments allowed
      if (args.length > 0) {
        return {
          valid: false,
          error: 'Command "memory list" does not accept arguments',
        };
      }
      return { valid: true };

    case 'memory refresh':
      // No arguments allowed
      if (args.length > 0) {
        return {
          valid: false,
          error: 'Command "memory refresh" does not accept arguments',
        };
      }
      return { valid: true };

    case 'memory add': {
      // Requires at least one argument (the text to add)
      if (args.length === 0) {
        return {
          valid: false,
          error: 'Command "memory add" requires text to add',
        };
      }

      // Join all args and validate the combined text
      const memoryText = args.join(' ');
      if (!isValidMemoryText(memoryText)) {
        return {
          valid: false,
          error:
            'Invalid memory text (must not contain control characters or shell metacharacters, max 10KB)',
        };
      }
      return { valid: true };
    }

    case 'restore': {
      // Requires exactly one argument (checkpoint name)
      if (args.length === 0) {
        return {
          valid: false,
          error: 'Command "restore" requires a checkpoint name',
        };
      }

      if (args.length > 1) {
        return {
          valid: false,
          error: 'Command "restore" accepts only one argument',
        };
      }

      // Validate checkpoint name
      const checkpointName = args[0];
      if (!isValidCheckpointName(checkpointName)) {
        return {
          valid: false,
          error:
            'Invalid checkpoint name (must be alphanumeric with dashes/underscores, optionally ending in .json)',
        };
      }
      return { valid: true };
    }

    case 'restore list':
      // No arguments allowed
      if (args.length > 0) {
        return {
          valid: false,
          error: 'Command "restore list" does not accept arguments',
        };
      }
      return { valid: true };

    case 'extensions':
    case 'extensions list':
      // No arguments allowed
      if (args.length > 0) {
        return {
          valid: false,
          error: 'Command "extensions list" does not accept arguments',
        };
      }
      return { valid: true };

    case 'init':
      // No arguments allowed (init command is internally driven)
      if (args.length > 0) {
        return {
          valid: false,
          error: 'Command "init" does not accept arguments',
        };
      }
      return { valid: true };

    default:
      // Unknown command to this validator - pass generic validation only
      // The command registry will determine if the command actually exists
      // We just ensure args don't contain obviously dangerous content
      for (const arg of args) {
        // Check for null bytes and control characters
        if (hasControlCharacters(arg)) {
          return {
            valid: false,
            error: 'Arguments must not contain control characters',
          };
        }
      }
      return { valid: true };
  }
}

/**
 * Main validation function for /executeCommand endpoint.
 * Validates both command name and arguments using allowlist approach.
 */
export function validateCommandExecution(
  command: string,
  args: string[],
): CommandValidationResult {
  // Validate command name first
  if (!isValidCommandName(command)) {
    return {
      valid: false,
      error: 'Invalid command name',
    };
  }

  // Validate arguments for this specific command
  return validateCommandArguments(command, args);
}
