/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolDefinition } from './types.js';
import { READ_FILE_TOOL_NAME, SHELL_TOOL_NAME } from '../tool-names.js';

export const READ_FILE_DEFINITION: ToolDefinition = {
  base: {
    name: READ_FILE_TOOL_NAME,
    description: `Reads and returns the content of a specified file. If the file is large, the content will be truncated. The tool's response will clearly indicate if truncation has occurred and will provide details on how to read more of the file using the 'offset' and 'limit' parameters. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), audio files (MP3, WAV, AIFF, AAC, OGG, FLAC), and PDF files. For text files, it can read specific line ranges.`,
    parameters: {
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
  variants: {
    flash: {
      description:
        'Reads a file from the local filesystem. Fast and efficient for checking file content.',
    },
    pro: {
      description:
        'Reads and returns the content of a specified file. Use this for comprehensive analysis of source code, configuration, or documentation.',
    },
  },
};

/**
 * Note: Shell tool has platform-specific and dynamic parts.
 * The base here contains the core schema.
 */
export const SHELL_DEFINITION: ToolDefinition = {
  base: {
    name: SHELL_TOOL_NAME,
    description: 'Executes a shell command.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute.',
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
  variants: {
    flash: {
      description:
        'Executes a single shell command. Use for simple operations like listing files or moving data.',
    },
    pro: {
      description:
        'Executes a shell command. Can be used for complex workflows, multi-step installations, or deep system investigations.',
    },
  },
};
