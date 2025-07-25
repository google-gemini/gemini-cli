/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';

/**
 * Splits a shell command into a list of individual commands, respecting quotes.
 * This is used to separate chained commands (e.g., using &&, ||, ;).
 * @param command The shell command string to parse
 * @returns An array of individual command strings
 */
export function splitCommands(command: string): string[] {
  const commands: string[] = [];
  let currentCommand = '';
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let i = 0;

  while (i < command.length) {
    const char = command[i];
    const nextChar = command[i + 1];

    if (char === '\\' && i < command.length - 1) {
      currentCommand += char + command[i + 1];
      i += 2;
      continue;
    }

    if (char === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
    } else if (char === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
    }

    if (!inSingleQuotes && !inDoubleQuotes) {
      if (
        (char === '&' && nextChar === '&') ||
        (char === '|' && nextChar === '|')
      ) {
        commands.push(currentCommand.trim());
        currentCommand = '';
        i++; // Skip the next character
      } else if (char === ';' || char === '&' || char === '|') {
        commands.push(currentCommand.trim());
        currentCommand = '';
      } else {
        currentCommand += char;
      }
    } else {
      currentCommand += char;
    }
    i++;
  }

  if (currentCommand.trim()) {
    commands.push(currentCommand.trim());
  }

  return commands.filter(Boolean); // Filter out any empty strings
}

/**
 * Extracts the root command from a given shell command string.
 * This is used to identify the base command for permission checks.
 * @param command The shell command string to parse
 * @returns The root command name, or undefined if it cannot be determined
 * @example getCommandRoot("ls -la /tmp") returns "ls"
 * @example getCommandRoot("git status && npm test") returns "git"
 */
export function getCommandRoot(command: string): string | undefined {
  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    return undefined;
  }

  // This regex is designed to find the first "word" of a command,
  // while respecting quotes. It looks for a sequence of non-whitespace
  // characters that are not inside quotes.
  const match = trimmedCommand.match(/^"([^"]+)"|^'([^']+)'|^(\S+)/);
  if (match) {
    // The first element in the match array is the full match.
    // The subsequent elements are the capture groups.
    // We prefer a captured group because it will be unquoted.
    const commandRoot = match[1] || match[2] || match[3];
    if (commandRoot) {
      // If the command is a path, return the last component.
      return commandRoot.split(/[\\/]/).pop();
    }
  }

  return undefined;
}

export function getCommandRoots(command: string): string[] {
  if (!command) {
    return [];
  }
  return splitCommands(command)
    .map((c) => getCommandRoot(c))
    .filter((c): c is string => !!c);
}

export function stripShellWrapper(command: string): string {
  const pattern = /^\s*(?:sh|bash|zsh|cmd.exe)\s+(?:\/c|-c)\s+/;
  const match = command.match(pattern);
  if (match) {
    let newCommand = command.substring(match[0].length).trim();
    if (
      (newCommand.startsWith('"') && newCommand.endsWith('"')) ||
      (newCommand.startsWith("'") && newCommand.endsWith("'"))
    ) {
      newCommand = newCommand.substring(1, newCommand.length - 1);
    }
    return newCommand;
  }
  return command.trim();
}

/**
 * Detects command substitution patterns in a shell command, following bash quoting rules:
 * - Single quotes ('): Everything literal, no substitution possible
 * - Double quotes ("): Command substitution with $() and backticks unless escaped with \
 * - No quotes: Command substitution with $(), <(), and backticks
 * @param command The shell command string to check
 * @returns true if command substitution would be executed by bash
 */
export function detectCommandSubstitution(command: string): boolean {
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let inBackticks = false;
  let i = 0;

  while (i < command.length) {
    const char = command[i];
    const nextChar = command[i + 1];

    // Handle escaping - only works outside single quotes
    if (char === '\\' && !inSingleQuotes) {
      i += 2; // Skip the escaped character
      continue;
    }

    // Handle quote state changes
    if (char === "'" && !inDoubleQuotes && !inBackticks) {
      inSingleQuotes = !inSingleQuotes;
    } else if (char === '"' && !inSingleQuotes && !inBackticks) {
      inDoubleQuotes = !inDoubleQuotes;
    } else if (char === '`' && !inSingleQuotes) {
      // Backticks work outside single quotes (including in double quotes)
      inBackticks = !inBackticks;
    }

    // Check for command substitution patterns that would be executed
    if (!inSingleQuotes) {
      // $(...) command substitution - works in double quotes and unquoted
      if (char === '$' && nextChar === '(') {
        return true;
      }

      // <(...) process substitution - works unquoted only (not in double quotes)
      if (char === '<' && nextChar === '(' && !inDoubleQuotes && !inBackticks) {
        return true;
      }

      // Backtick command substitution - check for opening backtick
      // (We track the state above, so this catches the start of backtick substitution)
      if (char === '`' && !inBackticks) {
        return true;
      }
    }

    i++;
  }

  return false;
}

/**
 * Determines whether a given shell command is allowed to execute based on
 * the tool's configuration including allowlists and blocklists.
 * @param command The shell command string to validate
 * @param config The application configuration
 * @returns An object with 'allowed' boolean and optional 'reason' string if not allowed
 */
export function isCommandAllowed(
  command: string,
  config: Config,
): { allowed: boolean; reason?: string } {
  // 0. Disallow command substitution
  // Parse the command to check for unquoted/unescaped command substitution
  const hasCommandSubstitution = detectCommandSubstitution(command);
  if (hasCommandSubstitution) {
    return {
      allowed: false,
      reason:
        'Command substitution using $(), <(), or >() is not allowed for security reasons',
    };
  }

  const SHELL_TOOL_NAMES = ['run_shell_command', 'ShellTool'];

  const normalize = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ');

  /**
   * Checks if a command string starts with a given prefix, ensuring it's a
   * whole word match (i.e., followed by a space or it's an exact match).
   * e.g., `isPrefixedBy('npm install', 'npm')` -> true
   * e.g., `isPrefixedBy('npm', 'npm')` -> true
   * e.g., `isPrefixedBy('npminstall', 'npm')` -> false
   */
  const isPrefixedBy = (cmd: string, prefix: string): boolean => {
    if (!cmd.startsWith(prefix)) {
      return false;
    }
    return cmd.length === prefix.length || cmd[prefix.length] === ' ';
  };

  /**
   * Extracts and normalizes shell commands from a list of tool strings.
   * e.g., 'ShellTool("ls -l")' becomes 'ls -l'
   */
  const extractCommands = (tools: string[]): string[] =>
    tools.flatMap((tool) => {
      for (const toolName of SHELL_TOOL_NAMES) {
        if (tool.startsWith(`${toolName}(`) && tool.endsWith(')')) {
          return [normalize(tool.slice(toolName.length + 1, -1))];
        }
      }
      return [];
    });

  const coreTools = config.getCoreTools() || [];
  const excludeTools = config.getExcludeTools() || [];

  // 1. Check if the shell tool is globally disabled.
  if (SHELL_TOOL_NAMES.some((name) => excludeTools.includes(name))) {
    return {
      allowed: false,
      reason: 'Shell tool is globally disabled in configuration',
    };
  }

  const blockedCommands = new Set(extractCommands(excludeTools));
  const allowedCommands = new Set(extractCommands(coreTools));

  const hasSpecificAllowedCommands = allowedCommands.size > 0;
  const isWildcardAllowed = SHELL_TOOL_NAMES.some((name) =>
    coreTools.includes(name),
  );

  const commandsToValidate = splitCommands(command).map(normalize);

  const blockedCommandsArr = [...blockedCommands];

  for (const cmd of commandsToValidate) {
    // 2. Check if the command is on the blocklist.
    const isBlocked = blockedCommandsArr.some((blocked) =>
      isPrefixedBy(cmd, blocked),
    );
    if (isBlocked) {
      return {
        allowed: false,
        reason: `Command '${cmd}' is blocked by configuration`,
      };
    }

    // 3. If in strict allow-list mode, check if the command is permitted.
    const isStrictAllowlist = hasSpecificAllowedCommands && !isWildcardAllowed;
    const allowedCommandsArr = [...allowedCommands];
    if (isStrictAllowlist) {
      const isAllowed = allowedCommandsArr.some((allowed) =>
        isPrefixedBy(cmd, allowed),
      );
      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Command '${cmd}' is not in the allowed commands list`,
        };
      }
    }
  }

  // 4. If all checks pass, the command is allowed.
  return { allowed: true };
}
