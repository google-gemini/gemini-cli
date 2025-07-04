/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { Tool, ToolInvocation, ToolOutput } from '@google/gemini-cli';

export class RmdirTool implements Tool {
  name = 'rmdir';
  description = 'Removes a directory.';

  async run(invocation: ToolInvocation): Promise<ToolOutput> {
    if (!invocation.files || invocation.files.length === 0) {
      return {
        type: 'error',
        message: 'No directory was provided to the rmdir tool.',
      };
    }

    const dirPath = invocation.files[0];

    try {
      await fs.rmdir(dirPath);
      return {
        type: 'text',
        content: `Removed directory ${dirPath}`,
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Error removing directory ${dirPath}: ${error.message}`,
      };
    }
  }
}
