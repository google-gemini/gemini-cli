/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AnyToolInvocation } from '../index.js';
import type { Config } from '../config/config.js';
import { doesToolInvocationMatch } from './tool-utils.js';
import {
  parseCommandDetails,
  SHELL_TOOL_NAMES,
  type ParsedCommandDetail,
} from './shell-utils.js';

/**
 * Checks a shell command against security policies and allowlists.
 *
 * This function operates in one of two modes depending on the presence of
 * the `sessionAllowlist` parameter:
 *
 * 1.  **"Default Deny" Mode (sessionAllowlist is provided):** This is the
 *     strictest mode, used for user-defined scripts like custom commands.
 *     A command is only permitted if it is found on the global `coreTools`
 *     allowlist OR the provided `sessionAllowlist`. It must not be on the
 *     global `excludeTools` blocklist.
 *
 * 2.  **"Default Allow" Mode (sessionAllowlist is NOT provided):** This mode
 *     is used for direct tool invocations (e.g., by the model). If a strict
 *     global `coreTools` allowlist exists, commands must be on it. Otherwise,
 *     any command is permitted as long as it is not on the `excludeTools`
 *     blocklist.
 *
 * @param command The shell command string to validate.
 * @param config The application configuration.
 * @param sessionAllowlist A session-level list of approved commands. Its
 *   presence activates "Default Deny" mode.
 * @returns An object detailing which commands are not allowed.
 */
export function checkCommandPermissions(
  command: string,
  config: Config,
  sessionAllowlist?: Set<string>,
): {
  allAllowed: boolean;
  disallowedCommands: string[];
  blockReason?: string;
  isHardDenial?: boolean;
} {
  const parseResult = parseCommandDetails(command);
  if (!parseResult || parseResult.hasError) {
    return {
      allAllowed: false,
      disallowedCommands: [command],
      blockReason: 'Command rejected because it could not be parsed safely',
      isHardDenial: true,
    };
  }

  const normalize = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ');
  const commandsToValidate = parseResult.details
    .map((detail: ParsedCommandDetail) => normalize(detail.text))
    .filter(Boolean);
  const invocation: AnyToolInvocation & { params: { command: string } } = {
    params: { command: '' },
  } as AnyToolInvocation & { params: { command: string } };

  // 1. Blocklist Check (Highest Priority)
  const excludeTools = config.getExcludeTools() || new Set([]);
  const isWildcardBlocked = SHELL_TOOL_NAMES.some((name) =>
    excludeTools.has(name),
  );

  if (isWildcardBlocked) {
    return {
      allAllowed: false,
      disallowedCommands: commandsToValidate,
      blockReason: 'Shell tool is globally disabled in configuration',
      isHardDenial: true,
    };
  }

  for (const cmd of commandsToValidate) {
    invocation.params['command'] = cmd;
    if (
      doesToolInvocationMatch('run_shell_command', invocation, [
        ...excludeTools,
      ])
    ) {
      return {
        allAllowed: false,
        disallowedCommands: [cmd],
        blockReason: `Command '${cmd}' is blocked by configuration`,
        isHardDenial: true,
      };
    }
  }

  const coreTools = config.getCoreTools() || [];
  const isWildcardAllowed = SHELL_TOOL_NAMES.some((name) =>
    coreTools.includes(name),
  );

  // If there's a global wildcard, all commands are allowed at this point
  // because they have already passed the blocklist check.
  if (isWildcardAllowed) {
    return { allAllowed: true, disallowedCommands: [] };
  }

  const disallowedCommands: string[] = [];

  if (sessionAllowlist) {
    // "DEFAULT DENY" MODE: A session allowlist is provided.
    // All commands must be in either the session or global allowlist.
    const normalizedSessionAllowlist = new Set(
      [...sessionAllowlist].flatMap((cmd) =>
        SHELL_TOOL_NAMES.map((name) => `${name}(${cmd})`),
      ),
    );

    for (const cmd of commandsToValidate) {
      invocation.params['command'] = cmd;
      const isSessionAllowed = doesToolInvocationMatch(
        'run_shell_command',
        invocation,
        [...normalizedSessionAllowlist],
      );
      if (isSessionAllowed) continue;

      const isGloballyAllowed = doesToolInvocationMatch(
        'run_shell_command',
        invocation,
        coreTools,
      );
      if (isGloballyAllowed) continue;

      disallowedCommands.push(cmd);
    }

    if (disallowedCommands.length > 0) {
      return {
        allAllowed: false,
        disallowedCommands,
        blockReason: `Command(s) not on the global or session allowlist. Disallowed commands: ${disallowedCommands
          .map((c) => JSON.stringify(c))
          .join(', ')}`,
        isHardDenial: false, // This is a soft denial; confirmation is possible.
      };
    }
  } else {
    // "DEFAULT ALLOW" MODE: No session allowlist.
    const hasSpecificAllowedCommands =
      coreTools.filter((tool) =>
        SHELL_TOOL_NAMES.some((name) => tool.startsWith(`${name}(`)),
      ).length > 0;

    if (hasSpecificAllowedCommands) {
      for (const cmd of commandsToValidate) {
        invocation.params['command'] = cmd;
        const isGloballyAllowed = doesToolInvocationMatch(
          'run_shell_command',
          invocation,
          coreTools,
        );
        if (!isGloballyAllowed) {
          disallowedCommands.push(cmd);
        }
      }
      if (disallowedCommands.length > 0) {
        return {
          allAllowed: false,
          disallowedCommands,
          blockReason: `Command(s) not in the allowed commands list. Disallowed commands: ${disallowedCommands
            .map((c) => JSON.stringify(c))
            .join(', ')}`,
          isHardDenial: false,
        };
      }
    }
    // If no specific global allowlist exists, and it passed the blocklist,
    // the command is allowed by default.
  }

  // If all checks for the current mode pass, the command is allowed.
  return { allAllowed: true, disallowedCommands: [] };
}

export function isCommandAllowed(
  command: string,
  config: Config,
): { allowed: boolean; reason?: string } {
  // By not providing a sessionAllowlist, we invoke "default allow" behavior.
  const { allAllowed, blockReason } = checkCommandPermissions(command, config);
  if (allAllowed) {
    return { allowed: true };
  }
  return { allowed: false, reason: blockReason };
}

/**
 * Determines whether a shell invocation should be auto-approved based on an allowlist.
 *
 * This reuses the same parsing logic as command-permission enforcement so that
 * chained commands must be individually covered by the allowlist.
 *
 * @param invocation The shell tool invocation being evaluated.
 * @param allowedPatterns The configured allowlist patterns (e.g. `run_shell_command(git)`).
 * @returns True if every parsed command segment is allowed by the patterns; false otherwise.
 */
export function isShellInvocationAllowlisted(
  invocation: AnyToolInvocation,
  allowedPatterns: string[],
): boolean {
  if (!allowedPatterns.length) {
    return false;
  }

  const hasShellWildcard = allowedPatterns.some((pattern) =>
    SHELL_TOOL_NAMES.includes(pattern),
  );
  const hasShellSpecificPattern = allowedPatterns.some((pattern) =>
    SHELL_TOOL_NAMES.some((name) => pattern.startsWith(`${name}(`)),
  );

  if (!hasShellWildcard && !hasShellSpecificPattern) {
    return false;
  }

  if (hasShellWildcard) {
    return true;
  }

  if (
    !('params' in invocation) ||
    typeof invocation.params !== 'object' ||
    invocation.params === null ||
    !('command' in invocation.params)
  ) {
    return false;
  }

  const commandValue = (invocation.params as { command?: unknown }).command;
  if (typeof commandValue !== 'string' || !commandValue.trim()) {
    return false;
  }

  const command = commandValue.trim();

  const parseResult = parseCommandDetails(command);
  if (!parseResult || parseResult.hasError) {
    return false;
  }

  const normalize = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ');
  const commandsToValidate = parseResult.details
    .map((detail: ParsedCommandDetail) => normalize(detail.text))
    .filter(Boolean);

  if (commandsToValidate.length === 0) {
    return false;
  }

  return commandsToValidate.every((commandSegment: string) =>
    doesToolInvocationMatch(
      SHELL_TOOL_NAMES[0],
      { params: { command: commandSegment } } as AnyToolInvocation,
      allowedPatterns,
    ),
  );
}
