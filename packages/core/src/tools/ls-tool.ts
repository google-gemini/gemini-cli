

import { promises as fs } from 'fs';
import {
  Tool,
  ToolInvocation,
  ToolOutput,
  ToolStream,
} from '../../../../core/src/core/tool.js';
import * as path from 'path';

export class LsTool implements Tool {
  name = 'ls';
  description = 'Lists the contents of a directory.';

  async run(invocation: ToolInvocation, stream: ToolStream): Promise<ToolOutput> {
    if (!invocation.files || invocation.files.length === 0) {
      return {
        type: 'error',
        message: 'No directory was provided to the ls tool.',
      };
    }

    const dirPath = invocation.files[0];

    try {
      const files = await fs.readdir(dirPath);
      return {
        type: 'text',
        content: files.join('\n'),
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Error reading directory ${dirPath}: ${error.message}`,
      };
    }
  }
}

