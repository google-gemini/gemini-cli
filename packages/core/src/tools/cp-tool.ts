/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { Tool, ToolInvocation, ToolOutput } from '@google/gemini-cli';

export class CpTool implements Tool {
  name = 'cp';
  description = 'Copies a file.';

  async run(invocation: ToolInvocation): Promise<ToolOutput> {
    if (!invocation.files || invocation.files.length < 2) {
      return {
        type: 'error',
        message: 'Please provide a source and destination to the cp tool.',
      };
    }

    const [srcPath, dstPath] = invocation.files;

    try {
      await fs.copyFile(srcPath, dstPath);
      return {
        type: 'text',
        content: `Copied ${srcPath} to ${dstPath}`,
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Error copying file from ${srcPath} to ${dstPath}: ${error.message}`,
      };
    }
  }
}
