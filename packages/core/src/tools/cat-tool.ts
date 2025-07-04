/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import {
  Tool,
  ToolInvocation,
  ToolOutput,
} from '@google/gemini-cli';

export class CatTool implements Tool {
  name = 'cat';
  description = 'Reads the contents of one or more files and returns them as a single string.';

  async run(invocation: ToolInvocation): Promise<ToolOutput> {
    if (!invocation.files || invocation.files.length === 0) {
      return {
        type: 'error',
        message: 'No files were provided to the cat tool.',
      };
    }

    const contents = await Promise.all(
      invocation.files.map(async (file) => {
        try {
          return await fs.readFile(file, 'utf-8');
        } catch (error) {
          return {
            type: 'error',
            message: `Error reading file ${file}: ${error.message}`,
          };
        }
      })
    );

    return {
      type: 'text',
      content: contents.join('\n'),
    };
  }
}

