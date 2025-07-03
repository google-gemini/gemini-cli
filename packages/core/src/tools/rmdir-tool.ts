
import { promises as fs } from 'fs';
import {
  Tool,
  ToolInvocation,
  ToolOutput,
  ToolStream,
} from '../../../../core/src/core/tool.js';

export class RmdirTool implements Tool {
  name = 'rmdir';
  description = 'Removes a directory.';

  async run(invocation: ToolInvocation, stream: ToolStream): Promise<ToolOutput> {
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
