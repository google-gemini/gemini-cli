/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Centralized constants for tool names.
// This prevents circular dependencies that can occur when other modules (like agents)
// need to reference a tool's name without importing the tool's implementation.

export const GLOB_TOOL_NAME = 'glob';
export const WRITE_TODOS_TOOL_NAME = 'write_todos';
export const WRITE_FILE_TOOL_NAME = 'write_file';
export const WEB_SEARCH_TOOL_NAME = 'google_web_search';
export const WEB_FETCH_TOOL_NAME = 'web_fetch';
export const EDIT_TOOL_NAME = 'replace';
export const SHELL_TOOL_NAME = 'run_shell_command';
export const GREP_TOOL_NAME = 'grep_search';
export const READ_MANY_FILES_TOOL_NAME = 'read_many_files';
export const READ_FILE_TOOL_NAME = 'read_file';
export const LS_TOOL_NAME = 'list_directory';
export const MEMORY_TOOL_NAME = 'save_memory';
export const GET_INTERNAL_DOCS_TOOL_NAME = 'get_internal_docs';
export const ACTIVATE_SKILL_TOOL_NAME = 'activate_skill';
export const EDIT_TOOL_NAMES = new Set([EDIT_TOOL_NAME, WRITE_FILE_TOOL_NAME]);
export const ASK_USER_TOOL_NAME = 'ask_user';
export const ASK_USER_DISPLAY_NAME = 'Ask User';
export const EXIT_PLAN_MODE_TOOL_NAME = 'exit_plan_mode';
export const ENTER_PLAN_MODE_TOOL_NAME = 'enter_plan_mode';

/**
 * Mapping of legacy tool names to their current names.
 * This ensures backward compatibility for user-defined policies, skills, and hooks.
 */
export const TOOL_LEGACY_ALIASES: Record<string, string> = {
  // Add future renames here, e.g.:
  search_file_content: GREP_TOOL_NAME,
};

/**
 * Returns all associated names for a tool (including legacy aliases and current name).
 * This ensures that if multiple legacy names point to the same tool, we consider all of them
 * for policy application.
 */
export function getToolAliases(name: string): string[] {
  const aliases = new Set<string>([name]);

  // Determine the canonical (current) name
  const canonicalName = TOOL_LEGACY_ALIASES[name] ?? name;
  aliases.add(canonicalName);

  // Find all other legacy aliases that point to the same canonical name
  for (const [legacyName, currentName] of Object.entries(TOOL_LEGACY_ALIASES)) {
    if (currentName === canonicalName) {
      aliases.add(legacyName);
    }
  }

  return Array.from(aliases);
}

/** Prefix used for tools discovered via the tool DiscoveryCommand. */
export const DISCOVERED_TOOL_PREFIX = 'discovered_tool_';

/**
 * List of all built-in tool names.
 */
export const ALL_BUILTIN_TOOL_NAMES = [
  GLOB_TOOL_NAME,
  WRITE_TODOS_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  EDIT_TOOL_NAME,
  SHELL_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  LS_TOOL_NAME,
  MEMORY_TOOL_NAME,
  ACTIVATE_SKILL_TOOL_NAME,
  ASK_USER_TOOL_NAME,
] as const;

/**
 * Read-only tools available in Plan Mode.
 * This list is used to dynamically generate the Plan Mode prompt,
 * filtered by what tools are actually enabled in the current configuration.
 */
export const PLAN_MODE_TOOLS = [
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  LS_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
] as const;

/**
 * Validates if a tool name is syntactically valid.
 * Checks against built-in tools, discovered tools, and MCP naming conventions.
 */
export function isValidToolName(
  name: string,
  options: { allowWildcards?: boolean } = {},
): boolean {
  // Built-in tools
  if ((ALL_BUILTIN_TOOL_NAMES as readonly string[]).includes(name)) {
    return true;
  }

  // Legacy aliases
  if (TOOL_LEGACY_ALIASES[name]) {
    return true;
  }

  // Discovered tools
  if (name.startsWith(DISCOVERED_TOOL_PREFIX)) {
    return true;
  }

  // Policy wildcards
  if (options.allowWildcards && name === '*') {
    return true;
  }

  // MCP tools (format: server__tool)
  if (name.includes('__')) {
    const parts = name.split('__');
    if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
      return false;
    }

    const server = parts[0];
    const tool = parts[1];

    if (tool === '*') {
      return !!options.allowWildcards;
    }

    // Basic slug validation for server and tool names
    const slugRegex = /^[a-z0-9-_]+$/i;
    return slugRegex.test(server) && slugRegex.test(tool);
  }

  return false;
}
