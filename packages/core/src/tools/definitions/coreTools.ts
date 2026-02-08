/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Type } from '@google/genai';
import type { ToolDefinition } from './types.js';
import { READ_FILE_TOOL_NAME, SHELL_TOOL_NAME } from '../tool-names.js';
import * as os from 'node:os';

// ============================================================================
// READ_FILE TOOL
// ============================================================================

export const READ_FILE_DEFINITION: ToolDefinition = {
  base: {
    name: READ_FILE_TOOL_NAME,
    description: `Reads and returns the content of a specified file. If the file is large, the content will be truncated. The tool's response will clearly indicate if truncation has occurred and will provide details on how to read more of the file using the 'offset' and 'limit' parameters. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), audio files (MP3, WAV, AIFF, AAC, OGG, FLAC), and PDF files. For text files, it can read specific line ranges.`,
    parametersJsonSchema: {
      type: Type.OBJECT,
      properties: {
        file_path: {
          description: 'The path to the file to read.',
          type: Type.STRING,
        },
        offset: {
          description:
            "Optional: For text files, the 0-based line number to start reading from. Requires 'limit' to be set. Use for paginating through large files.",
          type: Type.NUMBER,
        },
        limit: {
          description:
            "Optional: For text files, maximum number of lines to read. Use with 'offset' to paginate through large files. If omitted, reads the entire file (if feasible, up to a default limit).",
          type: Type.NUMBER,
        },
      },
      required: ['file_path'],
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
): string {
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
    return `This tool executes a given shell command as \`powershell.exe -NoProfile -Command <command>\`. ${backgroundInstructions}${returnedInfo}`;
  } else {
    const backgroundInstructions = enableInteractiveShell
      ? 'To run a command in the background, set the `is_background` parameter to true. Do NOT use `&` to background commands.'
      : 'Command can start background processes using `&`.';
    return `This tool executes a given shell command as \`bash -c <command>\`. ${backgroundInstructions} Command is executed as a subprocess that leads its own process group. Command process group can be terminated as \`kill -- -PGID\` or signaled as \`kill -s SIGNAL -- -PGID\`.${returnedInfo}`;
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
): ToolDefinition {
  return {
    base: {
      name: SHELL_TOOL_NAME,
      description: getShellToolDescription(enableInteractiveShell),
      parametersJsonSchema: {
        type: Type.OBJECT,
        properties: {
          command: {
            type: Type.STRING,
            description: getCommandDescription(),
          },
          description: {
            type: Type.STRING,
            description:
              'Brief description of the command for the user. Be specific and concise. Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.',
          },
          dir_path: {
            type: Type.STRING,
            description:
              '(OPTIONAL) The path of the directory to run the command in. If not provided, the project root directory is used. Must be a directory within the workspace and must already exist.',
          },
          is_background: {
            type: Type.BOOLEAN,
            description:
              'Set to true if this command should be run in the background (e.g. for long-running servers or watchers). The command will be started, allowed to run for a brief moment to check for immediate errors, and then moved to the background.',
          },
        },
        required: ['command'],
      },
    },
  };
}
