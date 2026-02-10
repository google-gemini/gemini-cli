/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolDefinition } from './types.js';
import * as os from 'node:os';

// Centralized tool names to avoid circular dependencies
export const GLOB_TOOL_NAME = 'glob';
export const GREP_TOOL_NAME = 'grep_search';
export const LS_TOOL_NAME = 'list_directory';
export const READ_FILE_TOOL_NAME = 'read_file';
export const SHELL_TOOL_NAME = 'run_shell_command';
export const WRITE_FILE_TOOL_NAME = 'write_file';

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
      },
      required: ['pattern'],
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
