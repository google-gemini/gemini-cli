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

export class RmTool implements Tool {
  name = 'rm';
  description = 'Removes a file.';

  async run(invocation: ToolInvocation): Promise<ToolOutput> {
    if (!invocation.files || invocation.files.length === 0) {
      return {
        type: 'error',
        message: 'No file was provided to the rm tool.',
      };
    }

    const filePath = invocation.files[0];

    try {
      await fs.unlink(filePath);
      return {
        type: 'text',
        content: `Removed ${filePath}`,
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Error removing file ${filePath}: ${error.message}`,
      };
    }
  }
}
