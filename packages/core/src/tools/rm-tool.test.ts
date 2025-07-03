
import { RmTool } from './rm-tool.js';
import { ToolInvocation } from '../../../../core/src/core/tool.js';
import { promises as fs } from 'fs';
import { jest } from '@jest/globals';

jest.mock('fs', () => ({
  promises: {
    unlink: jest.fn(),
  },
}));

describe('RmTool', () => {
  it('should remove a file', async () => {
    const tool = new RmTool();
    const invocation: ToolInvocation = {
      toolName: 'rm',
      files: ['/test.txt'],
    };
    const stream = {
      write: jest.fn(),
    };

    await tool.run(invocation, stream);

    expect(fs.unlink).toHaveBeenCalledWith('/test.txt');
  });

  it('should return an error if no file is provided', async () => {
    const tool = new RmTool();
    const invocation: ToolInvocation = {
      toolName: 'rm',
      files: [],
    };
    const stream = {
      write: jest.fn(),
    };

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message: 'No file was provided to the rm tool.',
    });
  });

  it('should return an error if the file cannot be removed', async () => {
    const tool = new RmTool();
    const invocation: ToolInvocation = {
      toolName: 'rm',
      files: ['/test.txt'],
    };
    const stream = {
      write: jest.fn(),
    };

    (fs.unlink as jest.Mock).mockRejectedValue(new Error('Permission denied'));

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message: 'Error removing file /test.txt: Permission denied',
    });
  });
});
