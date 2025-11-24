/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LanguageModelTools } from './lm-tools.js';

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
  },
  lm: {
    tools: [],
    invokeTool: vi.fn(),
  },
}));

describe('LanguageModelTools', () => {
  let log: (message: string) => void;
  let server: McpServer;
  let lmTools: LanguageModelTools;

  beforeEach(() => {
    vi.clearAllMocks();
    log = vi.fn();
    server = new McpServer({ name: 'test', version: '1.0.0' });
    lmTools = new LanguageModelTools(log);
    vi.spyOn(server, 'registerTool');
  });

  it('should register tools from vscode.lm.tools', async () => {
    const mockTools = [
      {
        name: 'tool1',
        description: 'description1',
        inputSchema: {
          type: 'object',
          properties: { param1: { type: 'string' } },
        },
      },
      {
        name: 'tool2',
        description: 'description2',
        inputSchema: {
          type: 'object',
          properties: { param2: { type: 'number' } },
        },
      },
    ];
    vi.spyOn(vscode.lm, 'tools', 'get').mockReturnValue(
      mockTools as vscode.LanguageModelToolInformation[],
    );

    await lmTools.registerTools(server);

    expect(server.registerTool).toHaveBeenCalledTimes(2);
    expect(server.registerTool).toHaveBeenCalledWith(
      'tool1',
      expect.objectContaining({
        description: 'description1',
        // Unclear how to performa a match against a zod schema
        inputSchema: expect.anything(),
      }),
      expect.any(Function),
    );
    expect(server.registerTool).toHaveBeenCalledWith(
      'tool2',
      expect.objectContaining({
        description: 'description2',
        // Unclear how to performa a match against a zod schema
        inputSchema: expect.anything(),
      }),
      expect.any(Function),
    );
  });

  it('should invoke the correct tool with the correct input', async () => {
    const mockTools = [
      {
        name: 'tool1',
        description: 'description1',
        inputSchema: {
          type: 'object',
          properties: { param1: { type: 'string' } },
        },
      },
    ];
    vi.spyOn(vscode.lm, 'tools', 'get').mockReturnValue(
      mockTools as vscode.LanguageModelToolInformation[],
    );
    const invokeToolSpy = vi.mocked(vscode.lm.invokeTool).mockResolvedValue({
      content: [{ value: 'result' } as vscode.LanguageModelTextPart],
    });

    await lmTools.registerTools(server);

    const toolImplementation = (server.registerTool as Mock).mock.calls[0][2];
    const input = { param1: 'test' };
    const result = await toolImplementation(input);

    expect(invokeToolSpy).toHaveBeenCalledWith('tool1', {
      toolInvocationToken: undefined,
      input,
    });
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: '{"value":"result"}',
        },
      ],
    });
  });

  it('should log and show an error message if tool registration fails', async () => {
    const error = new Error('test error');
    vi.spyOn(vscode.lm, 'tools', 'get').mockRejectedValue(error);
    const showErrorMessageSpy = vi.mocked(vscode.window.showErrorMessage);

    await lmTools.registerTools(server);

    expect(log).toHaveBeenCalledWith(
      `Error registering LM tools: ${error.message}`,
    );
    expect(showErrorMessageSpy).toHaveBeenCalledWith(
      `Error registering LM tools: ${error.message}`,
    );
  });
});
