
import { promises as fs } from 'fs';
import {
  Tool,
  ToolInvocation,
  ToolOutput,
  ToolStream,
} from '../../../../core/src/core/tool.js';

export class RmTool implements Tool {
  name = 'rm';
  description = 'Removes a file.';

  async run(invocation: ToolInvocation, stream: ToolStream): Promise<ToolOutput> {
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
