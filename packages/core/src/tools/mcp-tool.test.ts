/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Mocked } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import { DiscoveredMCPTool, generateValidName } from './mcp-tool.js'; // Added getStringifiedResultForDisplay
import type { ToolResult } from './tools.js';
import { ToolConfirmationOutcome } from './tools.js'; // Added ToolConfirmationOutcome
import type { CallableTool, Part } from '@google/genai';
import { ToolErrorType } from './tool-error.js';

// Mock @google/genai mcpToTool and CallableTool
// We only need to mock the parts of CallableTool that DiscoveredMCPTool uses.
const mockCallTool = vi.fn();
const mockToolMethod = vi.fn();

const mockCallableToolInstance: Mocked<CallableTool> = {
  tool: mockToolMethod as any, // Not directly used by DiscoveredMCPTool instance methods
  callTool: mockCallTool as any,
  // Add other methods if DiscoveredMCPTool starts using them
};

describe('generateValidName', () => {
  it('should return a valid name for a simple function', () => {
    expect(generateValidName('myFunction')).toBe('myFunction');
  });

  it('should replace invalid characters with underscores', () => {
    expect(generateValidName('invalid-name with spaces')).toBe(
      'invalid-name_with_spaces',
    );
  });

  it('should truncate long names', () => {
    expect(generateValidName('x'.repeat(80))).toBe(
      'xxxxxxxxxxxxxxxxxxxxxxxxxxxx___xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    );
  });

  it('should handle names with only invalid characters', () => {
    expect(generateValidName('!@#$%^&*()')).toBe('__________');
  });

  it('should handle names that are exactly 63 characters long', () => {
    expect(generateValidName('a'.repeat(63)).length).toBe(63);
  });

  it('should handle names that are exactly 64 characters long', () => {
    expect(generateValidName('a'.repeat(64)).length).toBe(63);
  });

  it('should handle names that are longer than 64 characters', () => {
    expect(generateValidName('a'.repeat(80)).length).toBe(63);
  });
});

describe('DiscoveredMCPTool', () => {
  const serverName = 'mock-mcp-server';
  const serverToolName = 'actual-server-tool-name';
  const baseDescription = 'A test MCP tool.';
  const inputSchema: Record<string, unknown> = {
    type: 'object' as const,
    properties: { param: { type: 'string' } },
    required: ['param'],
  };

  let tool: DiscoveredMCPTool;

  beforeEach(() => {
    mockCallTool.mockClear();
    mockToolMethod.mockClear();
    tool = new DiscoveredMCPTool(
      mockCallableToolInstance,
      serverName,
      serverToolName,
      baseDescription,
      inputSchema,
    );
    // Clear allowlist before each relevant test, especially for shouldConfirmExecute
    const invocation = tool.build({ param: 'mock' }) as any;
    invocation.constructor.allowlist.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should set properties correctly', () => {
      expect(tool.name).toBe(serverToolName);
      expect(tool.schema.name).toBe(serverToolName);
      expect(tool.schema.description).toBe(baseDescription);
      expect(tool.schema.parameters).toBeUndefined();
      expect(tool.schema.parametersJsonSchema).toEqual(inputSchema);
      expect(tool.serverToolName).toBe(serverToolName);
    });
  });

  describe('execute', () => {
    it('should call mcpTool.callTool with correct parameters and format display output', async () => {
      const params = { param: 'testValue' };
      const mockToolSuccessResultObject = {
        success: true,
        details: 'executed',
      };
      const mockFunctionResponseContent = [
        {
          type: 'text',
          text: JSON.stringify(mockToolSuccessResultObject),
        },
      ];
      const mockMcpToolResponseParts: Part[] = [
        {
          functionResponse: {
            name: serverToolName,
            response: { content: mockFunctionResponseContent },
          },
        },
      ];
      mockCallTool.mockResolvedValue(mockMcpToolResponseParts);

      const invocation = tool.build(params);
      const toolResult: ToolResult = await invocation.execute(
        new AbortController().signal,
      );

      expect(mockCallTool).toHaveBeenCalledWith([
        { name: serverToolName, args: params },
      ]);

      const stringifiedResponseContent = JSON.stringify(
        mockToolSuccessResultObject,
      );
      expect(toolResult.llmContent).toEqual([
        { text: stringifiedResponseContent },
      ]);
      expect(toolResult.returnDisplay).toBe(stringifiedResponseContent);
    });

    it('should handle empty result from getStringifiedResultForDisplay', async () => {
      const params = { param: 'testValue' };
      const mockMcpToolResponsePartsEmpty: Part[] = [];
      mockCallTool.mockResolvedValue(mockMcpToolResponsePartsEmpty);
      const invocation = tool.build(params);
      const toolResult: ToolResult = await invocation.execute(
        new AbortController().signal,
      );
      expect(toolResult.returnDisplay).toBe('```json\n[]\n```');
      expect(toolResult.llmContent).toEqual([
        { text: '[Error: Could not parse tool response]' },
      ]);
    });

    it('should propagate rejection if mcpTool.callTool rejects', async () => {
      const params = { param: 'failCase' };
      const expectedError = new Error('MCP call failed');
      mockCallTool.mockRejectedValue(expectedError);

      const invocation = tool.build(params);
      await expect(
        invocation.execute(new AbortController().signal),
      ).rejects.toThrow(expectedError);
    });

    it.each([
      { isErrorValue: true, description: 'true (bool)' },
      { isErrorValue: 'true', description: '"true" (str)' },
    ])(
      'should return a structured error if MCP tool reports an error',
      async ({ isErrorValue }) => {
        const tool = new DiscoveredMCPTool(
          mockCallableToolInstance,
          serverName,
          serverToolName,
          baseDescription,
          inputSchema,
        );
        const params = { param: 'isErrorTrueCase' };
        const functionCall = {
          name: serverToolName,
          args: params,
        };

        const errorResponse = { isError: isErrorValue };
        const mockMcpToolResponseParts: Part[] = [
          {
            functionResponse: {
              name: serverToolName,
              response: { error: errorResponse },
            },
          },
        ];
        mockCallTool.mockResolvedValue(mockMcpToolResponseParts);
        const expectedErrorMessage = `MCP tool '${
          serverToolName
        }' reported tool error for function call: ${safeJsonStringify(
          functionCall,
        )} with response: ${safeJsonStringify(mockMcpToolResponseParts)}`;
        const invocation = tool.build(params);
        const result = await invocation.execute(new AbortController().signal);

        expect(result.error?.type).toBe(ToolErrorType.MCP_TOOL_ERROR);
        expect(result.llmContent).toBe(expectedErrorMessage);
        expect(result.returnDisplay).toContain(
          `Error: MCP tool '${serverToolName}' reported an error.`,
        );
      },
    );

    it.each([
      { isErrorValue: false, description: 'false (bool)' },
      { isErrorValue: 'false', description: '"false" (str)' },
    ])(
      'should consider a ToolResult with isError ${description} to be a success',
      async ({ isErrorValue }) => {
        const tool = new DiscoveredMCPTool(
          mockCallableToolInstance,
          serverName,
          serverToolName,
          baseDescription,
          inputSchema,
        );
        const params = { param: 'isErrorFalseCase' };
        const mockToolSuccessResultObject = {
          success: true,
          details: 'executed',
        };
        const mockFunctionResponseContent = [
          {
            type: 'text',
            text: JSON.stringify(mockToolSuccessResultObject),
          },
        ];

        const errorResponse = { isError: isErrorValue };
        const mockMcpToolResponseParts: Part[] = [
          {
            functionResponse: {
              name: serverToolName,
              response: {
                error: errorResponse,
                content: mockFunctionResponseContent,
              },
            },
          },
        ];
        mockCallTool.mockResolvedValue(mockMcpToolResponseParts);

        const invocation = tool.build(params);
        const toolResult = await invocation.execute(
          new AbortController().signal,
        );

        const stringifiedResponseContent = JSON.stringify(
          mockToolSuccessResultObject,
        );
        expect(toolResult.llmContent).toEqual([
          { text: stringifiedResponseContent },
        ]);
        expect(toolResult.returnDisplay).toBe(stringifiedResponseContent);
      },
    );

    it('should handle a simple text response correctly', async () => {
      const params = { param: 'test' };
      const successMessage = 'This is a success message.';

      // Simulate the response from the GenAI SDK, which wraps the MCP
      // response in a functionResponse Part.
      const sdkResponse: Part[] = [
        {
          functionResponse: {
            name: serverToolName,
            response: {
              // The `content` array contains MCP ContentBlocks.
              content: [{ type: 'text', text: successMessage }],
            },
          },
        },
      ];
      mockCallTool.mockResolvedValue(sdkResponse);

      const invocation = tool.build(params);
      const toolResult = await invocation.execute(new AbortController().signal);

      // 1. Assert that the llmContent sent to the scheduler is a clean Part array.
      expect(toolResult.llmContent).toEqual([{ text: successMessage }]);

      // 2. Assert that the display output is the simple text message.
      expect(toolResult.returnDisplay).toBe(successMessage);

      // 3. Verify that the underlying callTool was made correctly.
      expect(mockCallTool).toHaveBeenCalledWith([
        { name: serverToolName, args: params },
      ]);
    });

    it('should handle an AudioBlock response', async () => {
      const params = { param: 'play' };
      const sdkResponse: Part[] = [
        {
          functionResponse: {
            name: serverToolName,
            response: {
              content: [
                {
                  type: 'audio',
                  data: 'BASE64_AUDIO_DATA',
                  mimeType: 'audio/mp3',
                },
              ],
            },
          },
        },
      ];
      mockCallTool.mockResolvedValue(sdkResponse);

      const invocation = tool.build(params);
      const toolResult = await invocation.execute(new AbortController().signal);

      expect(toolResult.llmContent).toEqual([
        {
          text: `[Tool '${serverToolName}' provided the following audio data with mime-type: audio/mp3]`,
        },
        {
          inlineData: {
            mimeType: 'audio/mp3',
            data: 'BASE64_AUDIO_DATA',
          },
        },
      ]);
      expect(toolResult.returnDisplay).toBe('[Audio: audio/mp3]');
    });

    it('should handle a ResourceLinkBlock response', async () => {
      const params = { param: 'get' };
      const sdkResponse: Part[] = [
        {
          functionResponse: {
            name: serverToolName,
            response: {
              content: [
                {
                  type: 'resource_link',
                  uri: 'file:///path/to/thing',
                  name: 'resource-name',
                  title: 'My Resource',
                },
              ],
            },
          },
        },
      ];
      mockCallTool.mockResolvedValue(sdkResponse);

      const invocation = tool.build(params);
      const toolResult = await invocation.execute(new AbortController().signal);

      expect(toolResult.llmContent).toEqual([
        {
          text: 'Resource Link: My Resource at file:///path/to/thing',
        },
      ]);
      expect(toolResult.returnDisplay).toBe(
        '[Link to My Resource: file:///path/to/thing]',
      );
    });

    it('should handle an embedded text ResourceBlock response', async () => {
      const params = { param: 'get' };
      const sdkResponse: Part[] = [
        {
          functionResponse: {
            name: serverToolName,
            response: {
              content: [
                {
                  type: 'resource',
                  resource: {
                    uri: 'file:///path/to/text.txt',
                    text: 'This is the text content.',
                    mimeType: 'text/plain',
                  },
                },
              ],
            },
          },
        },
      ];
      mockCallTool.mockResolvedValue(sdkResponse);

      const invocation = tool.build(params);
      const toolResult = await invocation.execute(new AbortController().signal);

      expect(toolResult.llmContent).toEqual([
        { text: 'This is the text content.' },
      ]);
      expect(toolResult.returnDisplay).toBe('This is the text content.');
    });

    it('should handle an embedded binary ResourceBlock response', async () => {
      const params = { param: 'get' };
      const sdkResponse: Part[] = [
        {
          functionResponse: {
            name: serverToolName,
            response: {
              content: [
                {
                  type: 'resource',
                  resource: {
                    uri: 'file:///path/to/data.bin',
                    blob: 'BASE64_BINARY_DATA',
                    mimeType: 'application/octet-stream',
                  },
                },
              ],
            },
          },
        },
      ];
      mockCallTool.mockResolvedValue(sdkResponse);

      const invocation = tool.build(params);
      const toolResult = await invocation.execute(new AbortController().signal);

      expect(toolResult.llmContent).toEqual([
        {
          text: `[Tool '${serverToolName}' provided the following embedded resource with mime-type: application/octet-stream]`,
        },
        {
          inlineData: {
            mimeType: 'application/octet-stream',
            data: 'BASE64_BINARY_DATA',
          },
        },
      ]);
      expect(toolResult.returnDisplay).toBe(
        '[Embedded Resource: application/octet-stream]',
      );
    });

    it('should handle a mix of content block types', async () => {
      const params = { param: 'complex' };
      const sdkResponse: Part[] = [
        {
          functionResponse: {
            name: serverToolName,
            response: {
              content: [
                { type: 'text', text: 'First part.' },
                {
                  type: 'image',
                  data: 'BASE64_IMAGE_DATA',
                  mimeType: 'image/jpeg',
                },
                { type: 'text', text: 'Second part.' },
              ],
            },
          },
        },
      ];
      mockCallTool.mockResolvedValue(sdkResponse);

      const invocation = tool.build(params);
      const toolResult = await invocation.execute(new AbortController().signal);

      expect(toolResult.llmContent).toEqual([
        { text: 'First part.' },
        {
          text: `[Tool '${serverToolName}' provided the following image data with mime-type: image/jpeg]`,
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: 'BASE64_IMAGE_DATA',
          },
        },
        { text: 'Second part.' },
      ]);
      expect(toolResult.returnDisplay).toBe(
        'First part.\n[Image: image/jpeg]\nSecond part.',
      );
    });

    it('should ignore unknown content block types', async () => {
      const params = { param: 'test' };
      const sdkResponse: Part[] = [
        {
          functionResponse: {
            name: serverToolName,
            response: {
              content: [
                { type: 'text', text: 'Valid part.' },
                { type: 'future_block', data: 'some-data' },
              ],
            },
          },
        },
      ];
      mockCallTool.mockResolvedValue(sdkResponse);

      const invocation = tool.build(params);
      const toolResult = await invocation.execute(new AbortController().signal);

      expect(toolResult.llmContent).toEqual([{ text: 'Valid part.' }]);
      expect(toolResult.returnDisplay).toBe(
        'Valid part.\n[Unknown content type: future_block]',
      );
    });

    it('should handle a complex mix of content block types', async () => {
      const params = { param: 'super-complex' };
      const sdkResponse: Part[] = [
        {
          functionResponse: {
            name: serverToolName,
            response: {
              content: [
                { type: 'text', text: 'Here is a resource.' },
                {
                  type: 'resource_link',
                  uri: 'file:///path/to/resource',
                  name: 'resource-name',
                  title: 'My Resource',
                },
                {
                  type: 'resource',
                  resource: {
                    uri: 'file:///path/to/text.txt',
                    text: 'Embedded text content.',
                    mimeType: 'text/plain',
                  },
                },
                {
                  type: 'image',
                  data: 'BASE64_IMAGE_DATA',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        },
      ];
      mockCallTool.mockResolvedValue(sdkResponse);

      const invocation = tool.build(params);
      const toolResult = await invocation.execute(new AbortController().signal);

      expect(toolResult.llmContent).toEqual([
        { text: 'Here is a resource.' },
        {
          text: 'Resource Link: My Resource at file:///path/to/resource',
        },
        { text: 'Embedded text content.' },
        {
          text: `[Tool '${serverToolName}' provided the following image data with mime-type: image/jpeg]`,
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: 'BASE64_IMAGE_DATA',
          },
        },
      ]);
      expect(toolResult.returnDisplay).toBe(
        'Here is a resource.\n[Link to My Resource: file:///path/to/resource]\nEmbedded text content.\n[Image: image/jpeg]',
      );
    });

    describe('AbortSignal support', () => {
      it('should abort immediately if signal is already aborted', async () => {
        const params = { param: 'test' };
        const controller = new AbortController();
        controller.abort();

        const invocation = tool.build(params);

        await expect(invocation.execute(controller.signal)).rejects.toThrow(
          'Tool call aborted',
        );

        // Tool should not be called if signal is already aborted
        expect(mockCallTool).not.toHaveBeenCalled();
      });

      it('should abort during tool execution', async () => {
        const params = { param: 'test' };
        const controller = new AbortController();

        // Mock a delayed response to simulate long-running tool
        mockCallTool.mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => {
                resolve([
                  {
                    functionResponse: {
                      name: serverToolName,
                      response: {
                        content: [{ type: 'text', text: 'Success' }],
                      },
                    },
                  },
                ]);
              }, 1000);
            }),
        );

        const invocation = tool.build(params);
        const promise = invocation.execute(controller.signal);

        // Abort after a short delay to simulate cancellation during execution
        setTimeout(() => controller.abort(), 50);

        await expect(promise).rejects.toThrow('Tool call aborted');
      });

      it('should complete successfully if not aborted', async () => {
        const params = { param: 'test' };
        const controller = new AbortController();
        const successResponse = [
          {
            functionResponse: {
              name: serverToolName,
              response: {
                content: [{ type: 'text', text: 'Success' }],
              },
            },
          },
        ];

        mockCallTool.mockResolvedValue(successResponse);

        const invocation = tool.build(params);
        const result = await invocation.execute(controller.signal);

        expect(result.llmContent).toEqual([{ text: 'Success' }]);
        expect(result.returnDisplay).toBe('Success');
        expect(mockCallTool).toHaveBeenCalledWith([
          { name: serverToolName, args: params },
        ]);
      });

      it('should handle tool error even when abort signal is provided', async () => {
        const params = { param: 'test' };
        const controller = new AbortController();
        const errorResponse = [
          {
            functionResponse: {
              name: serverToolName,
              response: { error: { isError: true } },
            },
          },
        ];

        mockCallTool.mockResolvedValue(errorResponse);

        const invocation = tool.build(params);
        const result = await invocation.execute(controller.signal);

        expect(result.error?.type).toBe(ToolErrorType.MCP_TOOL_ERROR);
        expect(result.returnDisplay).toContain(
          `Error: MCP tool '${serverToolName}' reported an error.`,
        );
      });

      it('should handle callTool rejection with abort signal', async () => {
        const params = { param: 'test' };
        const controller = new AbortController();
        const expectedError = new Error('Network error');

        mockCallTool.mockRejectedValue(expectedError);

        const invocation = tool.build(params);

        await expect(invocation.execute(controller.signal)).rejects.toThrow(
          expectedError,
        );
      });

      it('should cleanup event listeners properly on successful completion', async () => {
        const params = { param: 'test' };
        const controller = new AbortController();
        const successResponse = [
          {
            functionResponse: {
              name: serverToolName,
              response: {
                content: [{ type: 'text', text: 'Success' }],
              },
            },
          },
        ];

        mockCallTool.mockResolvedValue(successResponse);

        const invocation = tool.build(params);
        await invocation.execute(controller.signal);

        controller.abort();
        expect(controller.signal.aborted).toBe(true);
      });

      it('should cleanup event listeners properly on error', async () => {
        const params = { param: 'test' };
        const controller = new AbortController();
        const expectedError = new Error('Tool execution failed');

        mockCallTool.mockRejectedValue(expectedError);

        const invocation = tool.build(params);

        try {
          await invocation.execute(controller.signal);
        } catch (error) {
          expect(error).toBe(expectedError);
        }

        // Verify cleanup by aborting after error
        controller.abort();
        expect(controller.signal.aborted).toBe(true);
      });
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should return false if trust is true', async () => {
      const trustedTool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
        true,
        undefined,
        { isTrustedFolder: () => true } as any,
      );
      const invocation = trustedTool.build({ param: 'mock' });
      expect(
        await invocation.shouldConfirmExecute(new AbortController().signal),
      ).toBe(false);
    });

    it('should return false if server is allowlisted', async () => {
      const invocation = tool.build({ param: 'mock' }) as any;
      invocation.constructor.allowlist.add(serverName);
      expect(
        await invocation.shouldConfirmExecute(new AbortController().signal),
      ).toBe(false);
    });

    it('should return false if tool is allowlisted', async () => {
      const toolAllowlistKey = `${serverName}.${serverToolName}`;
      const invocation = tool.build({ param: 'mock' }) as any;
      invocation.constructor.allowlist.add(toolAllowlistKey);
      expect(
        await invocation.shouldConfirmExecute(new AbortController().signal),
      ).toBe(false);
    });

    it('should return confirmation details if not trusted and not allowlisted', async () => {
      const invocation = tool.build({ param: 'mock' });
      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (confirmation && confirmation.type === 'mcp') {
        // Type guard for ToolMcpConfirmationDetails
        expect(confirmation.type).toBe('mcp');
        expect(confirmation.serverName).toBe(serverName);
        expect(confirmation.toolName).toBe(serverToolName);
      } else if (confirmation) {
        // Handle other possible confirmation types if necessary, or strengthen test if only MCP is expected
        throw new Error(
          'Confirmation was not of expected type MCP or was false',
        );
      } else {
        throw new Error(
          'Confirmation details not in expected format or was false',
        );
      }
    });

    it('should add server to allowlist on ProceedAlwaysServer', async () => {
      const invocation = tool.build({ param: 'mock' }) as any;
      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        await confirmation.onConfirm(
          ToolConfirmationOutcome.ProceedAlwaysServer,
        );
        expect(invocation.constructor.allowlist.has(serverName)).toBe(true);
      } else {
        throw new Error(
          'Confirmation details or onConfirm not in expected format',
        );
      }
    });

    it('should add tool to allowlist on ProceedAlwaysTool', async () => {
      const toolAllowlistKey = `${serverName}.${serverToolName}`;
      const invocation = tool.build({ param: 'mock' }) as any;
      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        await confirmation.onConfirm(ToolConfirmationOutcome.ProceedAlwaysTool);
        expect(invocation.constructor.allowlist.has(toolAllowlistKey)).toBe(
          true,
        );
      } else {
        throw new Error(
          'Confirmation details or onConfirm not in expected format',
        );
      }
    });

    it('should handle Cancel confirmation outcome', async () => {
      const invocation = tool.build({ param: 'mock' }) as any;
      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        // Cancel should not add anything to allowlist
        await confirmation.onConfirm(ToolConfirmationOutcome.Cancel);
        expect(invocation.constructor.allowlist.has(serverName)).toBe(false);
        expect(
          invocation.constructor.allowlist.has(
            `${serverName}.${serverToolName}`,
          ),
        ).toBe(false);
      } else {
        throw new Error(
          'Confirmation details or onConfirm not in expected format',
        );
      }
    });

    it('should handle ProceedOnce confirmation outcome', async () => {
      const invocation = tool.build({ param: 'mock' }) as any;
      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        // ProceedOnce should not add anything to allowlist
        await confirmation.onConfirm(ToolConfirmationOutcome.ProceedOnce);
        expect(invocation.constructor.allowlist.has(serverName)).toBe(false);
        expect(
          invocation.constructor.allowlist.has(
            `${serverName}.${serverToolName}`,
          ),
        ).toBe(false);
      } else {
        throw new Error(
          'Confirmation details or onConfirm not in expected format',
        );
      }
    });
  });

  describe('shouldConfirmExecute with folder trust', () => {
    const mockConfig = (isTrusted: boolean | undefined) => ({
      isTrustedFolder: () => isTrusted,
    });

    it('should return false if trust is true and folder is trusted', async () => {
      const trustedTool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
        true, // trust = true
        undefined,
        mockConfig(true) as any, // isTrustedFolder = true
      );
      const invocation = trustedTool.build({ param: 'mock' });
      expect(
        await invocation.shouldConfirmExecute(new AbortController().signal),
      ).toBe(false);
    });

    it('should return confirmation details if trust is true but folder is not trusted', async () => {
      const trustedTool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
        true, // trust = true
        undefined,
        mockConfig(false) as any, // isTrustedFolder = false
      );
      const invocation = trustedTool.build({ param: 'mock' });
      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      expect(confirmation).toHaveProperty('type', 'mcp');
    });

    it('should return confirmation details if trust is false, even if folder is trusted', async () => {
      const untrustedTool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        serverToolName,
        baseDescription,
        inputSchema,
        false, // trust = false
        undefined,
        mockConfig(true) as any, // isTrustedFolder = true
      );
      const invocation = untrustedTool.build({ param: 'mock' });
      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      expect(confirmation).toHaveProperty('type', 'mcp');
    });
  });

  describe('DiscoveredMCPToolInvocation', () => {
    it('should return the stringified params from getDescription', () => {
      const params = { param: 'testValue', param2: 'anotherOne' };
      const invocation = tool.build(params);
      const description = invocation.getDescription();
      expect(description).toBe('{"param":"testValue","param2":"anotherOne"}');
    });
  });
});
