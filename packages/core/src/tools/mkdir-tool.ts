
import { promises as fs } from 'fs';
import {
  Tool,
  ToolInvocation,
  ToolOutput,
  ToolStream,
} from '../../../../core/src/core/tool.js';

export class MkdirTool implements Tool {
  name = 'mkdir';
  description = 'Creates a directory.';

  async run(invocation: ToolInvocation, stream: ToolStream): Promise<ToolOutput> {
    if (!invocation.files || invocation.files.length === 0) {
      return {
        type: 'error',
        message: 'No directory was provided to the mkdir tool.',
      };
    }

    const dirPath = invocation.files[0];

    try {
      await fs.mkdir(dirPath, { recursive: true });
      return {
        type: 'text',
        content: `Created directory ${dirPath}`,
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Error creating directory ${dirPath}: ${error.message}`,
      };
    }
  }
}
