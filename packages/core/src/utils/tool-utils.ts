/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isTool } from '../index.js';
import type { AnyDeclarativeTool, AnyToolInvocation } from '../tools/tools.js';
import { splitCommands } from './shell-utils.js';

const SHELL_TOOL_NAMES = ['run_shell_command', 'ShellTool'];

/**
 * Checks if a tool invocation matches any of a list of patterns.
 *
 * @param toolOrToolName The tool object or the name of the tool being invoked.
 * @param invocation The invocation object for the tool.
 * @param patterns A list of patterns to match against.
 *   Patterns can be:
 *   - A tool name (e.g., "ReadFileTool") to match any invocation of that tool.
 *   - A tool name with a prefix (e.g., "ShellTool(git status)") to match
 *     invocations where the arguments start with that prefix.
 * @returns True if the invocation matches any pattern, false otherwise.
 */
export function doesToolInvocationMatch(
  toolOrToolName: AnyDeclarativeTool | string,
  invocation: AnyToolInvocation,
  patterns: string[],
): boolean {
  let toolNames: string[];
  if (isTool(toolOrToolName)) {
    toolNames = [toolOrToolName.name, toolOrToolName.constructor.name];
  } else {
    toolNames = [toolOrToolName as string];
  }

  const isShellTool = toolNames.some((name) => SHELL_TOOL_NAMES.includes(name));
  if (isShellTool) {
    toolNames = [...new Set([...toolNames, ...SHELL_TOOL_NAMES])];
  }

  // Special handling for shell commands to deal with chained commands.
  if (isShellTool && 'command' in invocation.params) {
    const command = String((invocation.params as { command: string }).command);
    const subCommands = splitCommands(command);

    // Every single subcommand must be on the allowlist.
    return subCommands.every((subCommand) => {
      const subInvocation = {
        params: { command: subCommand },
      } as unknown as AnyToolInvocation;
      return patterns.some((pattern) =>
        isSingleCommandAllowed(pattern, toolNames, subInvocation),
      );
    });
  }

  // Default behavior for all other tools.
  for (const pattern of patterns) {
    if (isSingleCommandAllowed(pattern, toolNames, invocation)) {
      return true;
    }
  }

  return false;
}

function isSingleCommandAllowed(
  pattern: string,
  toolNames: string[],
  invocation: AnyToolInvocation,
): boolean {
  const openParen = pattern.indexOf('(');

  if (openParen === -1) {
    // No arguments, just a tool name
    return toolNames.includes(pattern);
  }

  const patternToolName = pattern.substring(0, openParen);
  if (!toolNames.includes(patternToolName)) {
    return false;
  }

  if (!pattern.endsWith(')')) {
    return false;
  }

  const argPattern = pattern.substring(openParen + 1, pattern.length - 1);

  if ('command' in invocation.params) {
    const argValue = String((invocation.params as { command: string }).command);
    // The command must either match the pattern exactly, or start with the
    // pattern followed by a space. This prevents partial matches on chained
    // commands, e.g., `echo foo` matching `echo foo | echo "evil"`.
    if (argValue === argPattern || argValue.startsWith(argPattern + ' ')) {
      return true;
    }
  }
  return false;
}
