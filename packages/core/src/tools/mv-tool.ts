
import { promises as fs } from 'fs';
import {
  Tool,
  ToolInvocation,
  ToolOutput,
  ToolStream,
} from '../../../../core/src/core/tool.js';

export class MvTool implements Tool {
  name = 'mv';
  description = 'Moves a file.';

  async run(invocation: ToolInvocation, stream: ToolStream): Promise<ToolOutput> {
    if (!invocation.files || invocation.files.length < 2) {
      return {
        type: 'error',
        message: 'Please provide a source and destination to the mv tool.',
      };
    }

    const [srcPath, dstPath] = invocation.files;

    try {
      await fs.rename(srcPath, dstPath);
      return {
        type: 'text',
        content: `Moved ${srcPath} to ${dstPath}`,
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Error moving file from ${srcPath} to ${dstPath}: ${error.message}`,
      };
    }
  }
}
