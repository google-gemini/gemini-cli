/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WRITE_TODOS_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  MEMORY_TOOL_NAME,
  GET_INTERNAL_DOCS_TOOL_NAME,
  ACTIVATE_SKILL_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  // Shared parameter names
  PARAM_FILE_PATH,
  PARAM_DIR_PATH,
  PARAM_PATTERN,
  PARAM_CASE_SENSITIVE,
  PARAM_RESPECT_GIT_IGNORE,
  PARAM_RESPECT_GEMINI_IGNORE,
  PARAM_FILE_FILTERING_OPTIONS,
  PARAM_DESCRIPTION,
  // Tool-specific parameter names
  READ_FILE_PARAM_START_LINE,
  READ_FILE_PARAM_END_LINE,
  WRITE_FILE_PARAM_CONTENT,
  GREP_PARAM_INCLUDE_PATTERN,
  GREP_PARAM_EXCLUDE_PATTERN,
  GREP_PARAM_NAMES_ONLY,
  GREP_PARAM_MAX_MATCHES_PER_FILE,
  GREP_PARAM_TOTAL_MAX_MATCHES,
  GREP_PARAM_FIXED_STRINGS,
  GREP_PARAM_CONTEXT,
  GREP_PARAM_AFTER,
  GREP_PARAM_BEFORE,
  GREP_PARAM_NO_IGNORE,
  EDIT_PARAM_INSTRUCTION,
  EDIT_PARAM_OLD_STRING,
  EDIT_PARAM_NEW_STRING,
  EDIT_PARAM_ALLOW_MULTIPLE,
  LS_PARAM_IGNORE,
  SHELL_PARAM_COMMAND,
  SHELL_PARAM_IS_BACKGROUND,
  WEB_SEARCH_PARAM_QUERY,
  WEB_FETCH_PARAM_PROMPT,
  READ_MANY_PARAM_INCLUDE,
  READ_MANY_PARAM_EXCLUDE,
  READ_MANY_PARAM_RECURSIVE,
  READ_MANY_PARAM_USE_DEFAULT_EXCLUDES,
  MEMORY_PARAM_FACT,
  TODOS_PARAM_TODOS,
  TODOS_ITEM_PARAM_DESCRIPTION,
  TODOS_ITEM_PARAM_STATUS,
  DOCS_PARAM_PATH,
  ASK_USER_PARAM_QUESTIONS,
  ASK_USER_QUESTION_PARAM_QUESTION,
  ASK_USER_QUESTION_PARAM_HEADER,
  ASK_USER_QUESTION_PARAM_TYPE,
  ASK_USER_QUESTION_PARAM_OPTIONS,
  ASK_USER_QUESTION_PARAM_MULTI_SELECT,
  ASK_USER_QUESTION_PARAM_PLACEHOLDER,
  ASK_USER_OPTION_PARAM_LABEL,
  ASK_USER_OPTION_PARAM_DESCRIPTION,
  PLAN_MODE_PARAM_REASON,
  EXIT_PLAN_PARAM_PLAN_PATH,
  SKILL_PARAM_NAME,
} from './definitions/coreTools.js';

export {
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WRITE_TODOS_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  MEMORY_TOOL_NAME,
  GET_INTERNAL_DOCS_TOOL_NAME,
  ACTIVATE_SKILL_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  // Shared parameter names
  PARAM_FILE_PATH,
  PARAM_DIR_PATH,
  PARAM_PATTERN,
  PARAM_CASE_SENSITIVE,
  PARAM_RESPECT_GIT_IGNORE,
  PARAM_RESPECT_GEMINI_IGNORE,
  PARAM_FILE_FILTERING_OPTIONS,
  PARAM_DESCRIPTION,
  // Tool-specific parameter names
  READ_FILE_PARAM_START_LINE,
  READ_FILE_PARAM_END_LINE,
  WRITE_FILE_PARAM_CONTENT,
  GREP_PARAM_INCLUDE_PATTERN,
  GREP_PARAM_EXCLUDE_PATTERN,
  GREP_PARAM_NAMES_ONLY,
  GREP_PARAM_MAX_MATCHES_PER_FILE,
  GREP_PARAM_TOTAL_MAX_MATCHES,
  GREP_PARAM_FIXED_STRINGS,
  GREP_PARAM_CONTEXT,
  GREP_PARAM_AFTER,
  GREP_PARAM_BEFORE,
  GREP_PARAM_NO_IGNORE,
  EDIT_PARAM_INSTRUCTION,
  EDIT_PARAM_OLD_STRING,
  EDIT_PARAM_NEW_STRING,
  EDIT_PARAM_ALLOW_MULTIPLE,
  LS_PARAM_IGNORE,
  SHELL_PARAM_COMMAND,
  SHELL_PARAM_IS_BACKGROUND,
  WEB_SEARCH_PARAM_QUERY,
  WEB_FETCH_PARAM_PROMPT,
  READ_MANY_PARAM_INCLUDE,
  READ_MANY_PARAM_EXCLUDE,
  READ_MANY_PARAM_RECURSIVE,
  READ_MANY_PARAM_USE_DEFAULT_EXCLUDES,
  MEMORY_PARAM_FACT,
  TODOS_PARAM_TODOS,
  TODOS_ITEM_PARAM_DESCRIPTION,
  TODOS_ITEM_PARAM_STATUS,
  DOCS_PARAM_PATH,
  ASK_USER_PARAM_QUESTIONS,
  ASK_USER_QUESTION_PARAM_QUESTION,
  ASK_USER_QUESTION_PARAM_HEADER,
  ASK_USER_QUESTION_PARAM_TYPE,
  ASK_USER_QUESTION_PARAM_OPTIONS,
  ASK_USER_QUESTION_PARAM_MULTI_SELECT,
  ASK_USER_QUESTION_PARAM_PLACEHOLDER,
  ASK_USER_OPTION_PARAM_LABEL,
  ASK_USER_OPTION_PARAM_DESCRIPTION,
  PLAN_MODE_PARAM_REASON,
  EXIT_PLAN_PARAM_PLAN_PATH,
  SKILL_PARAM_NAME,
};

export const LS_TOOL_NAME_LEGACY = 'list_directory'; // Just to be safe if anything used the old exported name directly

export const EDIT_TOOL_NAMES = new Set([EDIT_TOOL_NAME, WRITE_FILE_TOOL_NAME]);

// Tool Display Names
export const WRITE_FILE_DISPLAY_NAME = 'WriteFile';
export const EDIT_DISPLAY_NAME = 'Edit';
export const ASK_USER_DISPLAY_NAME = 'Ask User';
export const READ_FILE_DISPLAY_NAME = 'ReadFile';
export const GLOB_DISPLAY_NAME = 'FindFiles';

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
  GET_INTERNAL_DOCS_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
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
