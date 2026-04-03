/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CoreToolSet } from '../types.js';
import { DEFAULT_LEGACY_SET } from './default-legacy.js';
import {
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
  WRITE_TODOS_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  PARAM_FILE_PATH,
  PARAM_DIR_PATH,
  PARAM_PATTERN,
  PARAM_CASE_SENSITIVE,
  PARAM_RESPECT_GIT_IGNORE,
  PARAM_RESPECT_GEMINI_IGNORE,
  PARAM_FILE_FILTERING_OPTIONS,
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
  TODOS_PARAM_TODOS,
  TODOS_ITEM_PARAM_DESCRIPTION,
  TODOS_ITEM_PARAM_STATUS,
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
} from '../base-declarations.js';
import { getShellDeclaration } from '../dynamic-declaration-helpers.js';

const FILE_FILTERING_OPTIONS_SCHEMA = {
  type: 'object',
  properties: {
    [PARAM_RESPECT_GIT_IGNORE]: {
      type: 'boolean',
      description: 'Respect .gitignore. Defaults to true.',
    },
    [PARAM_RESPECT_GEMINI_IGNORE]: {
      type: 'boolean',
      description: 'Respect .geminiignore. Defaults to true.',
    },
  },
} as const;

export const LOCAL_GEMMA_SET: CoreToolSet = {
  ...DEFAULT_LEGACY_SET,

  read_file: {
    name: READ_FILE_TOOL_NAME,
    description:
      'Read a file. For large files, use line ranges and only read the section you need next.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_FILE_PATH]: {
          type: 'string',
          description: 'Path to the file to read.',
        },
        [READ_FILE_PARAM_START_LINE]: {
          type: 'number',
          description: 'Optional 1-based start line.',
        },
        [READ_FILE_PARAM_END_LINE]: {
          type: 'number',
          description: 'Optional 1-based end line, inclusive.',
        },
      },
      required: [PARAM_FILE_PATH],
    },
  },

  write_file: {
    name: WRITE_FILE_TOOL_NAME,
    description:
      'Create a new file or fully rewrite an existing file. Use this immediately when the user asks you to create a file. Always provide the complete final content.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_FILE_PATH]: {
          type: 'string',
          description: 'Path to the file to write.',
        },
        [WRITE_FILE_PARAM_CONTENT]: {
          type: 'string',
          description:
            'Complete file contents. Do not use placeholders or omit unchanged sections.',
        },
      },
      required: [PARAM_FILE_PATH, WRITE_FILE_PARAM_CONTENT],
    },
  },

  grep_search: {
    name: GREP_TOOL_NAME,
    description:
      'Search file contents. Use this to find symbols, strings, errors, or candidate edit locations.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_PATTERN]: {
          type: 'string',
          description: 'Regex pattern to search for.',
        },
        [PARAM_DIR_PATH]: {
          type: 'string',
          description:
            'Optional directory or file path to search. Defaults to the workspace root.',
        },
        [GREP_PARAM_INCLUDE_PATTERN]: {
          type: 'string',
          description: 'Optional glob to limit searched files.',
        },
        [GREP_PARAM_EXCLUDE_PATTERN]: {
          type: 'string',
          description: 'Optional regex to exclude matches.',
        },
        [GREP_PARAM_NAMES_ONLY]: {
          type: 'boolean',
          description: 'If true, return only matching file paths.',
        },
        [GREP_PARAM_MAX_MATCHES_PER_FILE]: {
          type: 'integer',
          minimum: 1,
          description: 'Optional per-file match limit.',
        },
        [GREP_PARAM_TOTAL_MAX_MATCHES]: {
          type: 'integer',
          minimum: 1,
          description: 'Optional overall match limit.',
        },
      },
      required: [PARAM_PATTERN],
    },
  },

  grep_search_ripgrep: {
    name: GREP_TOOL_NAME,
    description:
      'Fast content search powered by ripgrep. Prefer this to shell grep for code search.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_PATTERN]: {
          type: 'string',
          description: 'Pattern to search for.',
        },
        [PARAM_DIR_PATH]: {
          type: 'string',
          description:
            'Optional directory or file path to search. Defaults to the workspace root.',
        },
        [GREP_PARAM_INCLUDE_PATTERN]: {
          type: 'string',
          description: 'Optional glob to limit searched files.',
        },
        [GREP_PARAM_EXCLUDE_PATTERN]: {
          type: 'string',
          description: 'Optional regex to exclude matches.',
        },
        [GREP_PARAM_NAMES_ONLY]: {
          type: 'boolean',
          description: 'If true, return only matching file paths.',
        },
        [PARAM_CASE_SENSITIVE]: {
          type: 'boolean',
          description: 'If true, search is case-sensitive.',
        },
        [GREP_PARAM_FIXED_STRINGS]: {
          type: 'boolean',
          description: 'If true, treat the pattern as a literal string.',
        },
        [GREP_PARAM_CONTEXT]: {
          type: 'integer',
          description: 'Optional number of context lines around each match.',
        },
        [GREP_PARAM_AFTER]: {
          type: 'integer',
          minimum: 0,
          description: 'Optional number of lines to show after each match.',
        },
        [GREP_PARAM_BEFORE]: {
          type: 'integer',
          minimum: 0,
          description: 'Optional number of lines to show before each match.',
        },
        [GREP_PARAM_NO_IGNORE]: {
          type: 'boolean',
          description: 'If true, include normally ignored files.',
        },
        [GREP_PARAM_MAX_MATCHES_PER_FILE]: {
          type: 'integer',
          minimum: 1,
          description: 'Optional per-file match limit.',
        },
        [GREP_PARAM_TOTAL_MAX_MATCHES]: {
          type: 'integer',
          minimum: 1,
          description: 'Optional overall match limit.',
        },
      },
      required: [PARAM_PATTERN],
    },
  },

  glob: {
    name: GLOB_TOOL_NAME,
    description:
      'Find files by path pattern. Use this when you know the shape of the path you want.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_PATTERN]: {
          type: 'string',
          description: 'Glob pattern, for example `src/**/*.ts`.',
        },
        [PARAM_DIR_PATH]: {
          type: 'string',
          description:
            'Optional directory to search from. Defaults to the workspace root.',
        },
        [PARAM_CASE_SENSITIVE]: {
          type: 'boolean',
          description: 'If true, match case-sensitively.',
        },
        [PARAM_RESPECT_GIT_IGNORE]: {
          type: 'boolean',
          description: 'Respect .gitignore. Defaults to true.',
        },
        [PARAM_RESPECT_GEMINI_IGNORE]: {
          type: 'boolean',
          description: 'Respect .geminiignore. Defaults to true.',
        },
      },
      required: [PARAM_PATTERN],
    },
  },

  list_directory: {
    name: LS_TOOL_NAME,
    description:
      'List files and directories directly inside a directory. Use this for quick workspace inspection.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_DIR_PATH]: {
          type: 'string',
          description: 'Directory to list.',
        },
        [LS_PARAM_IGNORE]: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional glob patterns to ignore.',
        },
        [PARAM_FILE_FILTERING_OPTIONS]: {
          ...FILE_FILTERING_OPTIONS_SCHEMA,
          description: 'Optional ignore-file behavior.',
        },
      },
      required: [PARAM_DIR_PATH],
    },
  },

  run_shell_command: (
    enableInteractiveShell,
    enableEfficiency,
    enableToolSandboxing,
  ) => ({
    ...getShellDeclaration(
      enableInteractiveShell,
      enableEfficiency,
      enableToolSandboxing,
    ),
    description:
      'Run a shell command in the workspace. Use this for builds, tests, git, scripts, or file operations that are better handled in the shell. Do not use shell redirection or chmod as a substitute for write_file or replace.',
  }),

  replace: {
    name: EDIT_TOOL_NAME,
    description:
      'Make an exact text replacement inside an existing file. Read the file first so `old_string` matches exactly.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PARAM_FILE_PATH]: {
          type: 'string',
          description: 'Path to the file to modify.',
        },
        [EDIT_PARAM_INSTRUCTION]: {
          type: 'string',
          description: 'Short explanation of the intended change.',
        },
        [EDIT_PARAM_OLD_STRING]: {
          type: 'string',
          description:
            'Exact existing text to replace. It must match the file literally.',
        },
        [EDIT_PARAM_NEW_STRING]: {
          type: 'string',
          description:
            'Exact replacement text. Provide complete final text, not placeholders.',
        },
        [EDIT_PARAM_ALLOW_MULTIPLE]: {
          type: 'boolean',
          description: 'If true, replace every exact match.',
        },
      },
      required: [
        PARAM_FILE_PATH,
        EDIT_PARAM_INSTRUCTION,
        EDIT_PARAM_OLD_STRING,
        EDIT_PARAM_NEW_STRING,
      ],
    },
  },

  write_todos: {
    name: WRITE_TODOS_TOOL_NAME,
    description:
      'Track the current task as a short todo list. Use for multi-step work, not for trivial requests.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [TODOS_PARAM_TODOS]: {
          type: 'array',
          description: 'Complete replacement todo list.',
          items: {
            type: 'object',
            properties: {
              [TODOS_ITEM_PARAM_DESCRIPTION]: {
                type: 'string',
                description: 'Task description.',
              },
              [TODOS_ITEM_PARAM_STATUS]: {
                type: 'string',
                enum: [
                  'pending',
                  'in_progress',
                  'completed',
                  'cancelled',
                  'blocked',
                ],
                description: 'Current task status.',
              },
            },
            required: [TODOS_ITEM_PARAM_DESCRIPTION, TODOS_ITEM_PARAM_STATUS],
            additionalProperties: false,
          },
        },
      },
      required: [TODOS_PARAM_TODOS],
      additionalProperties: false,
    },
  },

  ask_user: {
    name: ASK_USER_TOOL_NAME,
    description:
      'Ask the user a small number of focused questions when a choice is ambiguous or risky.',
    parametersJsonSchema: {
      type: 'object',
      required: [ASK_USER_PARAM_QUESTIONS],
      properties: {
        [ASK_USER_PARAM_QUESTIONS]: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            required: [
              ASK_USER_QUESTION_PARAM_QUESTION,
              ASK_USER_QUESTION_PARAM_HEADER,
              ASK_USER_QUESTION_PARAM_TYPE,
            ],
            properties: {
              [ASK_USER_QUESTION_PARAM_QUESTION]: {
                type: 'string',
                description: 'Question to ask the user.',
              },
              [ASK_USER_QUESTION_PARAM_HEADER]: {
                type: 'string',
                description: 'Very short label shown with the question.',
              },
              [ASK_USER_QUESTION_PARAM_TYPE]: {
                type: 'string',
                enum: ['choice', 'text', 'yesno'],
                default: 'choice',
                description: 'Question type.',
              },
              [ASK_USER_QUESTION_PARAM_OPTIONS]: {
                type: 'array',
                description: 'Options for choice questions.',
                items: {
                  type: 'object',
                  required: [
                    ASK_USER_OPTION_PARAM_LABEL,
                    ASK_USER_OPTION_PARAM_DESCRIPTION,
                  ],
                  properties: {
                    [ASK_USER_OPTION_PARAM_LABEL]: {
                      type: 'string',
                      description: 'Option label.',
                    },
                    [ASK_USER_OPTION_PARAM_DESCRIPTION]: {
                      type: 'string',
                      description: 'Short option description.',
                    },
                  },
                },
              },
              [ASK_USER_QUESTION_PARAM_MULTI_SELECT]: {
                type: 'boolean',
                description: 'Allow multiple selections for a choice question.',
              },
              [ASK_USER_QUESTION_PARAM_PLACEHOLDER]: {
                type: 'string',
                description: 'Optional input placeholder.',
              },
            },
          },
        },
      },
    },
  },

  enter_plan_mode: {
    name: ENTER_PLAN_MODE_TOOL_NAME,
    description:
      'Switch to Plan Mode when the task needs research or design before code changes.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [PLAN_MODE_PARAM_REASON]: {
          type: 'string',
          description: 'Short reason for entering Plan Mode.',
        },
      },
    },
  },
};
