
import { promises as fs } from 'fs';
import {
  Tool,
  ToolInvocation,
  ToolOutput,
  ToolStream,
} from '../../../../core/src/core/tool.js';

export class TouchTool implements Tool {
  name = 'touch';
  description = 'Creates an empty file.';

  async run(invocation: ToolInvocation, stream: ToolStream): Promise<ToolOutput> {
    if (!invocation.files || invocation.files.length === 0) {
      return {
        type: 'error',
        message: 'No file was provided to the touch tool.',
      };
    }

    const filePath = invocation.files[0];

    try {
      await fs.writeFile(filePath, '');
      return {
        type: 'text',
        content: `Touched ${filePath}`,
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Error touching file ${filePath}: ${error.message}`,
      };
    }
  }
}
