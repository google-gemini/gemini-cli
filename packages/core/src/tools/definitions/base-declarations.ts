/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Identity registry for all core tools.
 * Sits at the bottom of the dependency tree to prevent circular imports.
 */

// ============================================================================
// SHARED PARAMETER NAMES (used by multiple tools)
// ============================================================================

export const PARAM_FILE_PATH = 'file_path';
export const PARAM_DIR_PATH = 'dir_path';
export const PARAM_PATTERN = 'pattern';
export const PARAM_CASE_SENSITIVE = 'case_sensitive';
export const PARAM_RESPECT_GIT_IGNORE = 'respect_git_ignore';
export const PARAM_RESPECT_GEMINI_IGNORE = 'respect_gemini_ignore';
export const PARAM_FILE_FILTERING_OPTIONS = 'file_filtering_options';
export const PARAM_DESCRIPTION = 'description';

// ============================================================================
// TOOL NAMES & TOOL-SPECIFIC PARAMETER NAMES
// ============================================================================

// -- glob --
export const GLOB_TOOL_NAME = 'glob';

// -- grep_search --
export const GREP_TOOL_NAME = 'grep_search';
export const GREP_PARAM_INCLUDE_PATTERN = 'include_pattern';
export const GREP_PARAM_EXCLUDE_PATTERN = 'exclude_pattern';
export const GREP_PARAM_NAMES_ONLY = 'names_only';
export const GREP_PARAM_MAX_MATCHES_PER_FILE = 'max_matches_per_file';
export const GREP_PARAM_TOTAL_MAX_MATCHES = 'total_max_matches';
// ripgrep only
export const GREP_PARAM_FIXED_STRINGS = 'fixed_strings';
export const GREP_PARAM_CONTEXT = 'context';
export const GREP_PARAM_AFTER = 'after';
export const GREP_PARAM_BEFORE = 'before';
export const GREP_PARAM_NO_IGNORE = 'no_ignore';

// -- list_directory --
export const LS_TOOL_NAME = 'list_directory';
export const LS_PARAM_IGNORE = 'ignore';

// -- read_file --
export const READ_FILE_TOOL_NAME = 'read_file';
export const READ_FILE_PARAM_START_LINE = 'start_line';
export const READ_FILE_PARAM_END_LINE = 'end_line';

// -- run_shell_command --
export const SHELL_TOOL_NAME = 'run_shell_command';
export const SHELL_PARAM_COMMAND = 'command';
export const SHELL_PARAM_IS_BACKGROUND = 'is_background';

// -- write_file --
export const WRITE_FILE_TOOL_NAME = 'write_file';
export const WRITE_FILE_PARAM_CONTENT = 'content';

// -- replace (edit) --
export const EDIT_TOOL_NAME = 'replace';
export const EDIT_PARAM_INSTRUCTION = 'instruction';
export const EDIT_PARAM_OLD_STRING = 'old_string';
export const EDIT_PARAM_NEW_STRING = 'new_string';
export const EDIT_PARAM_ALLOW_MULTIPLE = 'allow_multiple';

// -- google_web_search --
export const WEB_SEARCH_TOOL_NAME = 'google_web_search';
export const WEB_SEARCH_PARAM_QUERY = 'query';

// -- write_todos --
export const WRITE_TODOS_TOOL_NAME = 'write_todos';
export const TODOS_PARAM_TODOS = 'todos';
export const TODOS_ITEM_PARAM_DESCRIPTION = 'description';
export const TODOS_ITEM_PARAM_STATUS = 'status';

// -- web_fetch --
export const WEB_FETCH_TOOL_NAME = 'web_fetch';
export const WEB_FETCH_PARAM_PROMPT = 'prompt';

// -- read_many_files --
export const READ_MANY_FILES_TOOL_NAME = 'read_many_files';
export const READ_MANY_PARAM_INCLUDE = 'include';
export const READ_MANY_PARAM_EXCLUDE = 'exclude';
export const READ_MANY_PARAM_RECURSIVE = 'recursive';
export const READ_MANY_PARAM_USE_DEFAULT_EXCLUDES = 'useDefaultExcludes';

// -- save_memory --
export const MEMORY_TOOL_NAME = 'save_memory';
export const MEMORY_PARAM_FACT = 'fact';

// -- get_internal_docs --
export const GET_INTERNAL_DOCS_TOOL_NAME = 'get_internal_docs';
export const DOCS_PARAM_PATH = 'path';

// -- activate_skill --
export const ACTIVATE_SKILL_TOOL_NAME = 'activate_skill';
export const SKILL_PARAM_NAME = 'name';

// -- ask_user --
export const ASK_USER_TOOL_NAME = 'ask_user';
export const ASK_USER_PARAM_QUESTIONS = 'questions';
// ask_user question item params
export const ASK_USER_QUESTION_PARAM_QUESTION = 'question';
export const ASK_USER_QUESTION_PARAM_HEADER = 'header';
export const ASK_USER_QUESTION_PARAM_TYPE = 'type';
export const ASK_USER_QUESTION_PARAM_OPTIONS = 'options';
export const ASK_USER_QUESTION_PARAM_MULTI_SELECT = 'multiSelect';
export const ASK_USER_QUESTION_PARAM_PLACEHOLDER = 'placeholder';
// ask_user option item params
export const ASK_USER_OPTION_PARAM_LABEL = 'label';
export const ASK_USER_OPTION_PARAM_DESCRIPTION = 'description';

// -- exit_plan_mode --
export const EXIT_PLAN_MODE_TOOL_NAME = 'exit_plan_mode';
export const EXIT_PLAN_PARAM_PLAN_PATH = 'plan_path';

// -- enter_plan_mode --
export const ENTER_PLAN_MODE_TOOL_NAME = 'enter_plan_mode';
export const PLAN_MODE_PARAM_REASON = 'reason';
