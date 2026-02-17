/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolDefinition } from './types.js';
import * as os from 'node:os';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// This file serves as the source of truth for all core tool definitions across
// models. Tool implementation files should not contain any hardcoded
// definitions.

// Each tool has it's section, and a base ToolDefinition defined for that tool.
// For different model_ids, definition can be overridden to make the tool
// description or schema model_id specific.

// ============================================================================
// TOOL NAMES
// ============================================================================

export const GLOB_TOOL_NAME = 'glob';
export const GREP_TOOL_NAME = 'grep_search';
export const LS_TOOL_NAME = 'list_directory';
export const READ_FILE_TOOL_NAME = 'read_file';
export const SHELL_TOOL_NAME = 'run_shell_command';
export const WRITE_FILE_TOOL_NAME = 'write_file';
export const EDIT_TOOL_NAME = 'replace';
export const WEB_SEARCH_TOOL_NAME = 'google_web_search';

export const WRITE_TODOS_TOOL_NAME = 'write_todos';
export const WEB_FETCH_TOOL_NAME = 'web_fetch';
export const READ_MANY_FILES_TOOL_NAME = 'read_many_files';

export const MEMORY_TOOL_NAME = 'save_memory';
export const GET_INTERNAL_DOCS_TOOL_NAME = 'get_internal_docs';
export const ACTIVATE_SKILL_TOOL_NAME = 'activate_skill';
export const ASK_USER_TOOL_NAME = 'ask_user';
export const EXIT_PLAN_MODE_TOOL_NAME = 'exit_plan_mode';
export const ENTER_PLAN_MODE_TOOL_NAME = 'enter_plan_mode';

// ============================================================================
// READ_FILE TOOL
// ============================================================================

export const READ_FILE_DEFINITION: ToolDefinition = {
  base: {
    name: READ_FILE_TOOL_NAME,
    description: `Reads and returns the content of a specified file. If the file is large, the content will be truncated. The tool's response will clearly indicate if truncation has occurred and will provide details on how to read more of the file using the 'offset' and 'limit' parameters. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), audio files (MP3, WAV, AIFF, AAC, OGG, FLAC), and PDF files. For text files, it can read specific line ranges.`,
    parametersJsonSchema: {
      type: 'object',
      properties: {
        file_path: {
          description: 'The path to the file to read.',
          type: 'string',
        },
        offset: {
          description:
            "Optional: For text files, the 0-based line number to start reading from. Requires 'limit' to be set. Use for paginating through large files.",
          type: 'number',
        },
        limit: {
          description:
            "Optional: For text files, maximum number of lines to read. Use with 'offset' to paginate through large files. If omitted, reads the entire file (if feasible, up to a default limit).",
          type: 'number',
        },
      },
      required: ['file_path'],
    },
  },
};

// ============================================================================
// WRITE_FILE TOOL
// ============================================================================

export const WRITE_FILE_DEFINITION: ToolDefinition = {
  base: {
    name: WRITE_FILE_TOOL_NAME,
    description: `Writes content to a specified file in the local filesystem.

      The user has the ability to modify \`content\`. If modified, this will be stated in the response.`,
    parametersJsonSchema: {
      type: 'object',
      properties: {
        file_path: {
          description: 'The path to the file to write to.',
          type: 'string',
        },
        content: {
          description: 'The content to write to the file.',
          type: 'string',
        },
      },
      required: ['file_path', 'content'],
    },
  },
};

// ============================================================================
// GREP TOOL
// ============================================================================

export const GREP_DEFINITION: ToolDefinition = {
  base: {
    name: GREP_TOOL_NAME,
    description:
      'Searches for a regular expression pattern within file contents. Max 100 matches.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        pattern: {
          description: `The regular expression (regex) pattern to search for within file contents (e.g., 'function\\s+myFunction', 'import\\s+\\{.*\\}\\s+from\\s+.*').`,
          type: 'string',
        },
        dir_path: {
          description:
            'Optional: The absolute path to the directory to search within. If omitted, searches the current working directory.',
          type: 'string',
        },
        include: {
          description: `Optional: A glob pattern to filter which files are searched (e.g., '*.js', '*.{ts,tsx}', 'src/**'). If omitted, searches all files (respecting potential global ignores).`,
          type: 'string',
        },
        exclude_pattern: {
          description:
            'Optional: A regular expression pattern to exclude from the search results. If a line matches both the pattern and the exclude_pattern, it will be omitted.',
          type: 'string',
        },
        names_only: {
          description:
            'Optional: If true, only the file paths of the matches will be returned, without the line content or line numbers. This is useful for gathering a list of files.',
          type: 'boolean',
        },
        max_matches_per_file: {
          description:
            'Optional: Maximum number of matches to return per file. Use this to prevent being overwhelmed by repetitive matches in large files.',
          type: 'integer',
          minimum: 1,
        },
        total_max_matches: {
          description:
            'Optional: Maximum number of total matches to return. Use this to limit the overall size of the response. Defaults to 100 if omitted.',
          type: 'integer',
          minimum: 1,
        },
      },
      required: ['pattern'],
    },
  },
};

// ============================================================================
// RIP_GREP TOOL
// ============================================================================

export const RIP_GREP_DEFINITION: ToolDefinition = {
  base: {
    name: GREP_TOOL_NAME,
    description:
      'Searches for a regular expression pattern within file contents.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        pattern: {
          description: `The pattern to search for. By default, treated as a Rust-flavored regular expression. Use '\\b' for precise symbol matching (e.g., '\\bMatchMe\\b').`,
          type: 'string',
        },
        dir_path: {
          description:
            "Directory or file to search. Directories are searched recursively. Relative paths are resolved against current working directory. Defaults to current working directory ('.') if omitted.",
          type: 'string',
        },
        include: {
          description:
            "Glob pattern to filter files (e.g., '*.ts', 'src/**'). Recommended for large repositories to reduce noise. Defaults to all files if omitted.",
          type: 'string',
        },
        exclude_pattern: {
          description:
            'Optional: A regular expression pattern to exclude from the search results. If a line matches both the pattern and the exclude_pattern, it will be omitted.',
          type: 'string',
        },
        names_only: {
          description:
            'Optional: If true, only the file paths of the matches will be returned, without the line content or line numbers. This is useful for gathering a list of files.',
          type: 'boolean',
        },
        case_sensitive: {
          description:
            'If true, search is case-sensitive. Defaults to false (ignore case) if omitted.',
          type: 'boolean',
        },
        fixed_strings: {
          description:
            'If true, treats the `pattern` as a literal string instead of a regular expression. Defaults to false (basic regex) if omitted.',
          type: 'boolean',
        },
        context: {
          description:
            'Show this many lines of context around each match (equivalent to grep -C). Defaults to 0 if omitted.',
          type: 'integer',
        },
        after: {
          description:
            'Show this many lines after each match (equivalent to grep -A). Defaults to 0 if omitted.',
          type: 'integer',
          minimum: 0,
        },
        before: {
          description:
            'Show this many lines before each match (equivalent to grep -B). Defaults to 0 if omitted.',
          type: 'integer',
          minimum: 0,
        },
        no_ignore: {
          description:
            'If true, searches all files including those usually ignored (like in .gitignore, build/, dist/, etc). Defaults to false if omitted.',
          type: 'boolean',
        },
        max_matches_per_file: {
          description:
            'Optional: Maximum number of matches to return per file. Use this to prevent being overwhelmed by repetitive matches in large files.',
          type: 'integer',
          minimum: 1,
        },
        total_max_matches: {
          description:
            'Optional: Maximum number of total matches to return. Use this to limit the overall size of the response. Defaults to 100 if omitted.',
          type: 'integer',
          minimum: 1,
        },
      },
      required: ['pattern'],
    },
  },
};

// ============================================================================
// WEB_SEARCH TOOL
// ============================================================================

export const WEB_SEARCH_DEFINITION: ToolDefinition = {
  base: {
    name: WEB_SEARCH_TOOL_NAME,
    description:
      'Performs a web search using Google Search (via the Gemini API) and returns the results. This tool is useful for finding information on the internet based on a query.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find information on the web.',
        },
      },
      required: ['query'],
    },
  },
};

// ============================================================================
// EDIT TOOL
// ============================================================================

export const EDIT_DEFINITION: ToolDefinition = {
  base: {
    name: EDIT_TOOL_NAME,
    description: `Replaces text within a file. By default, replaces a single occurrence, but can replace multiple occurrences when \`expected_replacements\` is specified. This tool requires providing significant context around the change to ensure precise targeting. Always use the ${READ_FILE_TOOL_NAME} tool to examine the file's current content before attempting a text replacement.
      
      The user has the ability to modify the \`new_string\` content. If modified, this will be stated in the response.`,
    instructions: `
      Expectation for required parameters:
      1. \`old_string\` MUST be the exact literal text to replace (including all whitespace, indentation, newlines, and surrounding code etc.).
      2. \`new_string\` MUST be the exact literal text to replace \`old_string\` with (also including all whitespace, indentation, newlines, and surrounding code etc.). Ensure the resulting code is correct and idiomatic and that \`old_string\` and \`new_string\` are different.
      3. \`instruction\` is the detailed instruction of what needs to be changed. It is important to Make it specific and detailed so developers or large language models can understand what needs to be changed and perform the changes on their own if necessary. 
      4. NEVER escape \`old_string\` or \`new_string\`, that would break the exact literal text requirement.
      **Important:** If ANY of the above are not satisfied, the tool will fail. CRITICAL for \`old_string\`: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string matches multiple locations, or does not match exactly, the tool will fail.
      5. Prefer to break down complex and long changes into multiple smaller atomic calls to this tool. Always check the content of the file after changes or not finding a string to match.
      **Multiple replacements:** Set \`expected_replacements\` to the number of occurrences you want to replace. The tool will replace ALL occurrences that match \`old_string\` exactly. Ensure the number of replacements matches your expectation.`,
    parametersJsonSchema: {
      type: 'object',
      properties: {
        file_path: {
          description: 'The path to the file to modify.',
          type: 'string',
        },
        instruction: {
          description: `A clear, semantic instruction for the code change, acting as a high-quality prompt for an expert LLM assistant. It must be self-contained and explain the goal of the change.

A good instruction should concisely answer:
1.  WHY is the change needed? (e.g., "To fix a bug where users can be null...")
2.  WHERE should the change happen? (e.g., "...in the 'renderUserProfile' function...")
3.  WHAT is the high-level change? (e.g., "...add a null check for the 'user' object...")
4.  WHAT is the desired outcome? (e.g., "...so that it displays a loading spinner instead of crashing.")

**GOOD Example:** "In the 'calculateTotal' function, correct the sales tax calculation by updating the 'taxRate' constant from 0.05 to 0.075 to reflect the new regional tax laws."

**BAD Examples:**
- "Change the text." (Too vague)
- "Fix the bug." (Doesn't explain the bug or the fix)
- "Replace the line with this new line." (Brittle, just repeats the other parameters)
`,
          type: 'string',
        },
        old_string: {
          description:
            'The exact literal text to replace, preferably unescaped. For single replacements (default), include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string is not the exact literal text (i.e. you escaped it) or does not match exactly, the tool will fail.',
          type: 'string',
        },
        new_string: {
          description:
            'The exact literal text to replace `old_string` with, preferably unescaped. Provide the EXACT text. Ensure the resulting code is correct and idiomatic.',
          type: 'string',
        },
        expected_replacements: {
          type: 'number',
          description:
            'Number of replacements expected. Defaults to 1 if not specified. Use when you want to replace multiple occurrences.',
          minimum: 1,
        },
      },
      required: ['file_path', 'instruction', 'old_string', 'new_string'],
    },
  },
};

// ============================================================================
// GLOB TOOL
// ============================================================================

export const GLOB_DEFINITION: ToolDefinition = {
  base: {
    name: GLOB_TOOL_NAME,
    description:
      'Efficiently finds files matching specific glob patterns (e.g., `src/**/*.ts`, `**/*.md`), returning absolute paths sorted by modification time (newest first). Ideal for quickly locating files based on their name or path structure, especially in large codebases.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        pattern: {
          description:
            "The glob pattern to match against (e.g., '**/*.py', 'docs/*.md').",
          type: 'string',
        },
        dir_path: {
          description:
            'Optional: The absolute path to the directory to search within. If omitted, searches the root directory.',
          type: 'string',
        },
        case_sensitive: {
          description:
            'Optional: Whether the search should be case-sensitive. Defaults to false.',
          type: 'boolean',
        },
        respect_git_ignore: {
          description:
            'Optional: Whether to respect .gitignore patterns when finding files. Only available in git repositories. Defaults to true.',
          type: 'boolean',
        },
        respect_gemini_ignore: {
          description:
            'Optional: Whether to respect .geminiignore patterns when finding files. Defaults to true.',
          type: 'boolean',
        },
      },
      required: ['pattern'],
    },
  },
};

// ============================================================================
// LS TOOL
// ============================================================================

export const LS_DEFINITION: ToolDefinition = {
  base: {
    name: LS_TOOL_NAME,
    description:
      'Lists the names of files and subdirectories directly within a specified directory path. Can optionally ignore entries matching provided glob patterns.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        dir_path: {
          description: 'The path to the directory to list',
          type: 'string',
        },
        ignore: {
          description: 'List of glob patterns to ignore',
          items: {
            type: 'string',
          },
          type: 'array',
        },
        file_filtering_options: {
          description:
            'Optional: Whether to respect ignore patterns from .gitignore or .geminiignore',
          type: 'object',
          properties: {
            respect_git_ignore: {
              description:
                'Optional: Whether to respect .gitignore patterns when listing files. Only available in git repositories. Defaults to true.',
              type: 'boolean',
            },
            respect_gemini_ignore: {
              description:
                'Optional: Whether to respect .geminiignore patterns when listing files. Defaults to true.',
              type: 'boolean',
            },
          },
        },
      },
      required: ['dir_path'],
    },
  },
};

// ============================================================================
// SHELL TOOL
// ============================================================================

/**
 * Generates the platform-specific description for the shell tool.
 */
export function getShellToolDescription(
  enableInteractiveShell: boolean,
  enableEfficiency: boolean,
): string {
  const efficiencyGuidelines = enableEfficiency
    ? `

      Efficiency Guidelines:
      - Quiet Flags: Always prefer silent or quiet flags (e.g., \`npm install --silent\`, \`git --no-pager\`) to reduce output volume while still capturing necessary information.
      - Pagination: Always disable terminal pagination to ensure commands terminate (e.g., use \`git --no-pager\`, \`systemctl --no-pager\`, or set \`PAGER=cat\`).`
    : '';

  const returnedInfo = `

      The following information is returned:

      Output: Combined stdout/stderr. Can be \`(empty)\` or partial on error and for any unwaited background processes.
      Exit Code: Only included if non-zero (command failed).
      Error: Only included if a process-level error occurred (e.g., spawn failure).
      Signal: Only included if process was terminated by a signal.
      Background PIDs: Only included if background processes were started.
      Process Group PGID: Only included if available.`;

  if (os.platform() === 'win32') {
    const backgroundInstructions = enableInteractiveShell
      ? 'To run a command in the background, set the `is_background` parameter to true. Do NOT use PowerShell background constructs.'
      : 'Command can start background processes using PowerShell constructs such as `Start-Process -NoNewWindow` or `Start-Job`.';
    return `This tool executes a given shell command as \`powershell.exe -NoProfile -Command <command>\`. ${backgroundInstructions}${efficiencyGuidelines}${returnedInfo}`;
  } else {
    const backgroundInstructions = enableInteractiveShell
      ? 'To run a command in the background, set the `is_background` parameter to true. Do NOT use `&` to background commands.'
      : 'Command can start background processes using `&`.';
    return `This tool executes a given shell command as \`bash -c <command>\`. ${backgroundInstructions} Command is executed as a subprocess that leads its own process group. Command process group can be terminated as \`kill -- -PGID\` or signaled as \`kill -s SIGNAL -- -PGID\`.${efficiencyGuidelines}${returnedInfo}`;
  }
}

/**
 * Returns the platform-specific description for the 'command' parameter.
 */
export function getCommandDescription(): string {
  if (os.platform() === 'win32') {
    return 'Exact command to execute as `powershell.exe -NoProfile -Command <command>`';
  }
  return 'Exact bash command to execute as `bash -c <command>`';
}

/**
 * Returns the tool definition for the shell tool, customized for the platform.
 */
export function getShellDefinition(
  enableInteractiveShell: boolean,
  enableEfficiency: boolean,
): ToolDefinition {
  return {
    base: {
      name: SHELL_TOOL_NAME,
      description: getShellToolDescription(
        enableInteractiveShell,
        enableEfficiency,
      ),
      parametersJsonSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: getCommandDescription(),
          },
          description: {
            type: 'string',
            description:
              'Brief description of the command for the user. Be specific and concise. Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.',
          },
          dir_path: {
            type: 'string',
            description:
              '(OPTIONAL) The path of the directory to run the command in. If not provided, the project root directory is used. Must be a directory within the workspace and must already exist.',
          },
          is_background: {
            type: 'boolean',
            description:
              'Set to true if this command should be run in the background (e.g. for long-running servers or watchers). The command will be started, allowed to run for a brief moment to check for immediate errors, and then moved to the background.',
          },
        },
        required: ['command'],
      },
    },
  };
}

// ============================================================================
// WEB_FETCH TOOL
// ============================================================================

export const WEB_FETCH_DEFINITION: ToolDefinition = {
  base: {
    name: WEB_FETCH_TOOL_NAME,
    description:
      "Processes content from URL(s), including local and private network addresses (e.g., localhost), embedded in a prompt. Include up to 20 URLs and instructions (e.g., summarize, extract specific data) directly in the 'prompt' parameter.",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        prompt: {
          description:
            'A comprehensive prompt that includes the URL(s) (up to 20) to fetch and specific instructions on how to process their content (e.g., "Summarize https://example.com/article and extract key points from https://another.com/data"). All URLs to be fetched must be valid and complete, starting with "http://" or "https://", and be fully-formed with a valid hostname (e.g., a domain name like "example.com" or an IP address). For example, "https://example.com" is valid, but "example.com" is not.',
          type: 'string',
        },
      },
      required: ['prompt'],
    },
  },
};

// ============================================================================
// READ_MANY_FILES TOOL
// ============================================================================

export const READ_MANY_FILES_DEFINITION: ToolDefinition = {
  base: {
    name: READ_MANY_FILES_TOOL_NAME,
    description: `Reads content from multiple files specified by glob patterns within a configured target directory. For text files, it concatenates their content into a single string. It is primarily designed for text-based files. However, it can also process image (e.g., .png, .jpg), audio (e.g., .mp3, .wav), and PDF (.pdf) files if their file names or extensions are explicitly included in the 'include' argument. For these explicitly requested non-text files, their data is read and included in a format suitable for model consumption (e.g., base64 encoded).

This tool is useful when you need to understand or analyze a collection of files, such as:
- Getting an overview of a codebase or parts of it (e.g., all TypeScript files in the 'src' directory).
- Finding where specific functionality is implemented if the user asks broad questions about code.
- Reviewing documentation files (e.g., all Markdown files in the 'docs' directory).
- Gathering context from multiple configuration files.
- When the user asks to "read all files in X directory" or "show me the content of all Y files".

Use this tool when the user's query implies needing the content of several files simultaneously for context, analysis, or summarization. For text files, it uses default UTF-8 encoding and a '--- {filePath} ---' separator between file contents. The tool inserts a '--- End of content ---' after the last file. Ensure glob patterns are relative to the target directory. Glob patterns like 'src/**/*.js' are supported. Avoid using for single files if a more specific single-file reading tool is available, unless the user specifically requests to process a list containing just one file via this tool. Other binary files (not explicitly requested as image/audio/PDF) are generally skipped. Default excludes apply to common non-text files (except for explicitly requested images/audio/PDFs) and large dependency directories unless 'useDefaultExcludes' is false.`,
    parametersJsonSchema: {
      type: 'object',
      properties: {
        include: {
          type: 'array',
          items: {
            type: 'string',
            minLength: 1,
          },
          minItems: 1,
          description:
            'An array of glob patterns or paths. Examples: ["src/**/*.ts"], ["README.md", "docs/"]',
        },
        exclude: {
          type: 'array',
          items: {
            type: 'string',
            minLength: 1,
          },
          description:
            'Optional. Glob patterns for files/directories to exclude. Added to default excludes if useDefaultExcludes is true. Example: "**/*.log", "temp/"',
          default: [],
        },
        recursive: {
          type: 'boolean',
          description:
            'Optional. Whether to search recursively (primarily controlled by `**` in glob patterns). Defaults to true.',
          default: true,
        },
        useDefaultExcludes: {
          type: 'boolean',
          description:
            'Optional. Whether to apply a list of default exclusion patterns (e.g., node_modules, .git, binary files). Defaults to true.',
          default: true,
        },
        file_filtering_options: {
          description:
            'Whether to respect ignore patterns from .gitignore or .geminiignore',
          type: 'object',
          properties: {
            respect_git_ignore: {
              description:
                'Optional: Whether to respect .gitignore patterns when listing files. Only available in git repositories. Defaults to true.',
              type: 'boolean',
            },
            respect_gemini_ignore: {
              description:
                'Optional: Whether to respect .geminiignore patterns when listing files. Defaults to true.',
              type: 'boolean',
            },
          },
        },
      },
      required: ['include'],
    },
  },
};

// ============================================================================
// MEMORY TOOL
// ============================================================================

export const MEMORY_DEFINITION: ToolDefinition = {
  base: {
    name: MEMORY_TOOL_NAME,
    description: `
Saves concise global user context (preferences, facts) for use across ALL workspaces.

### CRITICAL: GLOBAL CONTEXT ONLY
NEVER save workspace-specific context, local paths, or commands (e.g. "The entry point is src/index.js", "The test command is npm test"). These are local to the current workspace and must NOT be saved globally. EXCLUSIVELY for context relevant across ALL workspaces.

- Use for "Remember X" or clear personal facts.
- Do NOT use for session context.`,
    parametersJsonSchema: {
      type: 'object',
      properties: {
        fact: {
          type: 'string',
          description:
            'The specific fact or piece of information to remember. Should be a clear, self-contained statement.',
        },
      },
      required: ['fact'],
      additionalProperties: false,
    },
  },
};

// ============================================================================
// WRITE_TODOS TOOL
// ============================================================================

export const WRITE_TODOS_DEFINITION: ToolDefinition = {
  base: {
    name: WRITE_TODOS_TOOL_NAME,
    description: `This tool can help you list out the current subtasks that are required to be completed for a given user request. The list of subtasks helps you keep track of the current task, organize complex queries and help ensure that you don't miss any steps. With this list, the user can also see the current progress you are making in executing a given task.

Depending on the task complexity, you should first divide a given task into subtasks and then use this tool to list out the subtasks that are required to be completed for a given user request.
Each of the subtasks should be clear and distinct. 

Use this tool for complex queries that require multiple steps. If you find that the request is actually complex after you have started executing the user task, create a todo list and use it. If execution of the user task requires multiple steps, planning and generally is higher complexity than a simple Q&A, use this tool.

DO NOT use this tool for simple tasks that can be completed in less than 2 steps. If the user query is simple and straightforward, do not use the tool. If you can respond with an answer in a single turn then this tool is not required.`,
    instructions: `
## Task state definitions

- pending: Work has not begun on a given subtask.
- in_progress: Marked just prior to beginning work on a given subtask. You should only have one subtask as in_progress at a time.
- completed: Subtask was successfully completed with no errors or issues. If the subtask required more steps to complete, update the todo list with the subtasks. All steps should be identified as completed only when they are completed.
- cancelled: As you update the todo list, some tasks are not required anymore due to the dynamic nature of the task. In this case, mark the subtasks as cancelled.


## Methodology for using this tool
1. Use this todo list as soon as you receive a user request based on the complexity of the task.
2. Keep track of every subtask that you update the list with.
3. Mark a subtask as in_progress before you begin working on it. You should only have one subtask as in_progress at a time.
4. Update the subtask list as you proceed in executing the task. The subtask list is not static and should reflect your progress and current plans, which may evolve as you acquire new information.
5. Mark a subtask as completed when you have completed it.
6. Mark a subtask as cancelled if the subtask is no longer needed.
7. You must update the todo list as soon as you start, stop or cancel a subtask. Don't batch or wait to update the todo list.


## Examples of When to Use the Todo List

<example>
User request: Create a website with a React for creating fancy logos using gemini-2.5-flash-image

ToDo list created by the agent:
1. Initialize a new React project environment (e.g., using Vite).
2. Design and build the core UI components: a text input (prompt field) for the logo description, selection controls for style parameters (if the API supports them), and an image preview area.
3. Implement state management (e.g., React Context or Zustand) to manage the user's input prompt, the API loading status (pending, success, error), and the resulting image data.
4. Create an API service module within the React app (using "fetch" or "axios") to securely format and send the prompt data via an HTTP POST request to the specified "gemini-2.5-flash-image" (Gemini model) endpoint.
5. Implement asynchronous logic to handle the API call: show a loading indicator while the request is pending, retrieve the generated image (e.g., as a URL or base64 string) upon success, and display any errors.
6. Display the returned "fancy logo" from the API response in the preview area component.
7. Add functionality (e.g., a "Download" button) to allow the user to save the generated image file.
8. Deploy the application to a web server or hosting platform.

<reasoning>
The agent used the todo list to break the task into distinct, manageable steps:
1. Building an entire interactive web application from scratch is a highly complex, multi-stage process involving setup, UI development, logic integration, and deployment.
2. The agent inferred the core functionality required for a "logo creator," such as UI controls for customization (Task 3) and an export feature (Task 7), which must be tracked as distinct goals.
3. The agent rightly inferred the requirement of an API service model for interacting with the image model endpoint.
</reasoning>
</example>


## Examples of When NOT to Use the Todo List

<example>
User request: Ensure that the test <test file> passes.

Agent:
<Goes into a loop of running the test, identifying errors, and updating the code until the test passes.>

<reasoning>
The agent did not use the todo list because this task could be completed by a tight loop of execute test->edit->execute test.
</reasoning>
</example>`,
    parametersJsonSchema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description:
            'The complete list of todo items. This will replace the existing list.',
          items: {
            type: 'object',
            description: 'A single todo item.',
            properties: {
              description: {
                type: 'string',
                description: 'The description of the task.',
              },
              status: {
                type: 'string',
                description: 'The current status of the task.',
                enum: ['pending', 'in_progress', 'completed', 'cancelled'],
              },
            },
            required: ['description', 'status'],
            additionalProperties: false,
          },
        },
      },
      required: ['todos'],
      additionalProperties: false,
    },
  },
};

// ============================================================================
// GET_INTERNAL_DOCS TOOL
// ============================================================================

export const GET_INTERNAL_DOCS_DEFINITION: ToolDefinition = {
  base: {
    name: GET_INTERNAL_DOCS_TOOL_NAME,
    description:
      'Returns the content of Gemini CLI internal documentation files. If no path is provided, returns a list of all available documentation paths.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        path: {
          description:
            "The relative path to the documentation file (e.g., 'cli/commands.md'). If omitted, lists all available documentation.",
          type: 'string',
        },
      },
    },
  },
};

// ============================================================================
// ASK_USER TOOL
// ============================================================================

export const ASK_USER_DEFINITION: ToolDefinition = {
  base: {
    name: ASK_USER_TOOL_NAME,
    description:
      'Ask the user one or more questions to gather preferences, clarify requirements, or make decisions.',
    parametersJsonSchema: {
      type: 'object',
      required: ['questions'],
      properties: {
        questions: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            required: ['question', 'header', 'type'],
            properties: {
              question: {
                type: 'string',
                description:
                  'The complete question to ask the user. Should be clear, specific, and end with a question mark.',
              },
              header: {
                type: 'string',
                maxLength: 16,
                description:
                  'MUST be 16 characters or fewer or the call will fail. Very short label displayed as a chip/tag. Use abbreviations: "Auth" not "Authentication", "Config" not "Configuration". Examples: "Auth method", "Library", "Approach", "Database".',
              },
              type: {
                type: 'string',
                enum: ['choice', 'text', 'yesno'],
                default: 'choice',
                description:
                  "Question type: 'choice' (default) for multiple-choice with options, 'text' for free-form input, 'yesno' for Yes/No confirmation.",
              },
              options: {
                type: 'array',
                description:
                  "The selectable choices for 'choice' type questions. Provide 2-4 options. An 'Other' option is automatically added. Not needed for 'text' or 'yesno' types.",
                items: {
                  type: 'object',
                  required: ['label', 'description'],
                  properties: {
                    label: {
                      type: 'string',
                      description:
                        'The display text for this option (1-5 words). Example: "OAuth 2.0"',
                    },
                    description: {
                      type: 'string',
                      description:
                        'Brief explanation of this option. Example: "Industry standard, supports SSO"',
                    },
                  },
                },
              },
              multiSelect: {
                type: 'boolean',
                description:
                  "Only applies when type='choice'. Set to true to allow selecting multiple options.",
              },
              placeholder: {
                type: 'string',
                description:
                  "Hint text shown in the input field. For type='text', shown in the main input. For type='choice', shown in the 'Other' custom input.",
              },
            },
          },
        },
      },
    },
  },
};

// ============================================================================
// PLAN_MODE TOOLS
// ============================================================================

export const ENTER_PLAN_MODE_DEFINITION: ToolDefinition = {
  base: {
    name: ENTER_PLAN_MODE_TOOL_NAME,
    description:
      'Switch to Plan Mode to safely research, design, and plan complex changes using read-only tools.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description:
            'Short reason explaining why you are entering plan mode.',
        },
      },
    },
  },
};

/**
 * Returns the tool definition for exiting plan mode.
 */
export function getExitPlanModeDefinition(plansDir: string): ToolDefinition {
  return {
    base: {
      name: EXIT_PLAN_MODE_TOOL_NAME,
      description:
        'Signals that the planning phase is complete and requests user approval to start implementation.',
      parametersJsonSchema: {
        type: 'object',
        required: ['plan_path'],
        properties: {
          plan_path: {
            type: 'string',
            description: `The file path to the finalized plan (e.g., "${plansDir}/feature-x.md"). This path MUST be within the designated plans directory: ${plansDir}/`,
          },
        },
      },
    },
  };
}

// ============================================================================
// ACTIVATE_SKILL TOOL
// ============================================================================

/**
 * Returns the tool definition for activating a skill.
 */
export function getActivateSkillDefinition(
  skillNames: string[],
): ToolDefinition {
  const availableSkillsHint =
    skillNames.length > 0
      ? ` (Available: ${skillNames.map((n) => `'${n}'`).join(', ')})`
      : '';

  let schema: z.ZodTypeAny;
  if (skillNames.length === 0) {
    schema = z.object({
      name: z.string().describe('No skills are currently available.'),
    });
  } else {
    schema = z.object({
      name: z
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        .enum(skillNames as [string, ...string[]])
        .describe('The name of the skill to activate.'),
    });
  }

  return {
    base: {
      name: ACTIVATE_SKILL_TOOL_NAME,
      description: `Activates a specialized agent skill by name${availableSkillsHint}. Returns the skill's instructions wrapped in \`<activated_skill>\` tags. These provide specialized guidance for the current task. Use this when you identify a task that matches a skill's description. ONLY use names exactly as they appear in the \`<available_skills>\` section.`,
      parametersJsonSchema: zodToJsonSchema(schema),
    },
  };
}
