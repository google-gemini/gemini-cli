/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  populateMcpServerCommand,
  createTransport,
  isEnabled,
  discoverTools,
  discoverPrompts,
  hasValidTypes,
  connectToMcpServer,
} from './mcp-client.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import * as SdkClientStdioLib from '@modelcontextprotocol/sdk/client/stdio.js';
import * as ClientLib from '@modelcontextprotocol/sdk/client/index.js';
import * as GenAiLib from '@google/genai';
import { GoogleCredentialProvider } from '../mcp/google-auth-provider.js';
import { AuthProviderType } from '../config/config.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';

import { DiscoveredMCPTool } from './mcp-tool.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import { pathToFileURL } from 'node:url';

vi.mock('@modelcontextprotocol/sdk/client/stdio.js');
vi.mock('@modelcontextprotocol/sdk/client/index.js');
vi.mock('@google/genai');
vi.mock('../mcp/oauth-provider.js');
vi.mock('../mcp/oauth-token-storage.js');
vi.mock('./mcp-tool.js');

describe('mcp-client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('discoverTools', () => {
    it('should discover tools', async () => {
      const mockedClient = {} as unknown as ClientLib.Client;
      const mockedMcpToTool = vi.mocked(GenAiLib.mcpToTool).mockReturnValue({
        tool: () => ({
          functionDeclarations: [
            {
              name: 'testFunction',
            },
          ],
        }),
      } as unknown as GenAiLib.CallableTool);

      const tools = await discoverTools('test-server', {}, mockedClient);

      expect(tools.length).toBe(1);
      expect(mockedMcpToTool).toHaveBeenCalledOnce();
    });

    it('should log an error if there is an error discovering a tool', async () => {
      const mockedClient = {} as unknown as ClientLib.Client;
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const testError = new Error('Invalid tool name');
      vi.mocked(DiscoveredMCPTool).mockImplementation(
        (
          _mcpCallableTool: GenAiLib.CallableTool,
          _serverName: string,
          name: string,
        ) => {
          if (name === 'invalid tool name') {
            throw testError;
          }
          return { name: 'validTool' } as DiscoveredMCPTool;
        },
      );

      vi.mocked(GenAiLib.mcpToTool).mockReturnValue({
        tool: () =>
          Promise.resolve({
            functionDeclarations: [
              {
                name: 'validTool',
              },
              {
                name: 'invalid tool name', // this will fail validation
              },
            ],
          }),
      } as unknown as GenAiLib.CallableTool);

      const tools = await discoverTools('test-server', {}, mockedClient);

      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('validTool');
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Error discovering tool: 'invalid tool name' from MCP server 'test-server': ${testError.message}`,
      );
    });

    it('should skip tools if a parameter is missing a type', async () => {
      const mockedClient = {} as unknown as ClientLib.Client;
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      vi.mocked(GenAiLib.mcpToTool).mockReturnValue({
        tool: () =>
          Promise.resolve({
            functionDeclarations: [
              {
                name: 'validTool',
                parametersJsonSchema: {
                  type: 'object',
                  properties: {
                    param1: { type: 'string' },
                  },
                },
              },
              {
                name: 'invalidTool',
                parametersJsonSchema: {
                  type: 'object',
                  properties: {
                    param1: { description: 'a param with no type' },
                  },
                },
              },
            ],
          }),
      } as unknown as GenAiLib.CallableTool);

      const tools = await discoverTools('test-server', {}, mockedClient);

      expect(tools.length).toBe(1);
      expect(vi.mocked(DiscoveredMCPTool).mock.calls[0][2]).toBe('validTool');
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `Skipping tool 'invalidTool' from MCP server 'test-server' because it has ` +
          `missing types in its parameter schema. Please file an issue with the owner of the MCP server.`,
      );
      consoleWarnSpy.mockRestore();
    });

    it('should skip tools if a nested parameter is missing a type', async () => {
      const mockedClient = {} as unknown as ClientLib.Client;
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      vi.mocked(GenAiLib.mcpToTool).mockReturnValue({
        tool: () =>
          Promise.resolve({
            functionDeclarations: [
              {
                name: 'invalidTool',
                parametersJsonSchema: {
                  type: 'object',
                  properties: {
                    param1: {
                      type: 'object',
                      properties: {
                        nestedParam: {
                          description: 'a nested param with no type',
                        },
                      },
                    },
                  },
                },
              },
            ],
          }),
      } as unknown as GenAiLib.CallableTool);

      const tools = await discoverTools('test-server', {}, mockedClient);

      expect(tools.length).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `Skipping tool 'invalidTool' from MCP server 'test-server' because it has ` +
          `missing types in its parameter schema. Please file an issue with the owner of the MCP server.`,
      );
      consoleWarnSpy.mockRestore();
    });

    it('should skip tool if an array item is missing a type', async () => {
      const mockedClient = {} as unknown as ClientLib.Client;
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      vi.mocked(GenAiLib.mcpToTool).mockReturnValue({
        tool: () =>
          Promise.resolve({
            functionDeclarations: [
              {
                name: 'invalidTool',
                parametersJsonSchema: {
                  type: 'object',
                  properties: {
                    param1: {
                      type: 'array',
                      items: {
                        description: 'an array item with no type',
                      },
                    },
                  },
                },
              },
            ],
          }),
      } as unknown as GenAiLib.CallableTool);

      const tools = await discoverTools('test-server', {}, mockedClient);

      expect(tools.length).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `Skipping tool 'invalidTool' from MCP server 'test-server' because it has ` +
          `missing types in its parameter schema. Please file an issue with the owner of the MCP server.`,
      );
      consoleWarnSpy.mockRestore();
    });

    it('should discover tool with no properties in schema', async () => {
      const mockedClient = {} as unknown as ClientLib.Client;
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      vi.mocked(GenAiLib.mcpToTool).mockReturnValue({
        tool: () =>
          Promise.resolve({
            functionDeclarations: [
              {
                name: 'validTool',
                parametersJsonSchema: {
                  type: 'object',
                },
              },
            ],
          }),
      } as unknown as GenAiLib.CallableTool);

      const tools = await discoverTools('test-server', {}, mockedClient);

      expect(tools.length).toBe(1);
      expect(vi.mocked(DiscoveredMCPTool).mock.calls[0][2]).toBe('validTool');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it('should discover tool with empty properties object in schema', async () => {
      const mockedClient = {} as unknown as ClientLib.Client;
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      vi.mocked(GenAiLib.mcpToTool).mockReturnValue({
        tool: () =>
          Promise.resolve({
            functionDeclarations: [
              {
                name: 'validTool',
                parametersJsonSchema: {
                  type: 'object',
                  properties: {},
                },
              },
            ],
          }),
      } as unknown as GenAiLib.CallableTool);

      const tools = await discoverTools('test-server', {}, mockedClient);

      expect(tools.length).toBe(1);
      expect(vi.mocked(DiscoveredMCPTool).mock.calls[0][2]).toBe('validTool');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('connectToMcpServer', () => {
    it('should register a roots/list handler', async () => {
      const mockedClient = {
        registerCapabilities: vi.fn(),
        setRequestHandler: vi.fn(),
        callTool: vi.fn(),
        connect: vi.fn(),
      };
      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
      const mockWorkspaceContext = {
        getDirectories: vi
          .fn()
          .mockReturnValue(['/test/dir', '/another/project']),
      } as unknown as WorkspaceContext;

      await connectToMcpServer(
        'test-server',
        {
          command: 'test-command',
        },
        false,
        mockWorkspaceContext,
      );

      expect(mockedClient.registerCapabilities).toHaveBeenCalledWith({
        roots: {},
      });
      expect(mockedClient.setRequestHandler).toHaveBeenCalledOnce();
      const handler = mockedClient.setRequestHandler.mock.calls[0][1];
      const roots = await handler();
      expect(roots).toEqual({
        roots: [
          {
            uri: pathToFileURL('/test/dir').toString(),
            name: 'dir',
          },
          {
            uri: pathToFileURL('/another/project').toString(),
            name: 'project',
          },
        ],
      });
    });
  });

  describe('discoverPrompts', () => {
    const mockedPromptRegistry = {
      registerPrompt: vi.fn(),
    } as unknown as PromptRegistry;

    it('should discover and log prompts', async () => {
      const mockRequest = vi.fn().mockResolvedValue({
        prompts: [
          { name: 'prompt1', description: 'desc1' },
          { name: 'prompt2' },
        ],
      });
      const mockGetServerCapabilities = vi.fn().mockReturnValue({
        prompts: {},
      });
      const mockedClient = {
        getServerCapabilities: mockGetServerCapabilities,
        request: mockRequest,
      } as unknown as ClientLib.Client;

      await discoverPrompts('test-server', mockedClient, mockedPromptRegistry);

      expect(mockGetServerCapabilities).toHaveBeenCalledOnce();
      expect(mockRequest).toHaveBeenCalledWith(
        { method: 'prompts/list', params: {} },
        expect.anything(),
      );
    });

    it('should do nothing if no prompts are discovered', async () => {
      const mockRequest = vi.fn().mockResolvedValue({
        prompts: [],
      });
      const mockGetServerCapabilities = vi.fn().mockReturnValue({
        prompts: {},
      });

      const mockedClient = {
        getServerCapabilities: mockGetServerCapabilities,
        request: mockRequest,
      } as unknown as ClientLib.Client;

      const consoleLogSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      await discoverPrompts('test-server', mockedClient, mockedPromptRegistry);

      expect(mockGetServerCapabilities).toHaveBeenCalledOnce();
      expect(mockRequest).toHaveBeenCalledOnce();
      expect(consoleLogSpy).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('should do nothing if the server has no prompt support', async () => {
      const mockRequest = vi.fn().mockResolvedValue({
        prompts: [],
      });
      const mockGetServerCapabilities = vi.fn().mockReturnValue({});

      const mockedClient = {
        getServerCapabilities: mockGetServerCapabilities,
        request: mockRequest,
      } as unknown as ClientLib.Client;

      const consoleLogSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      await discoverPrompts('test-server', mockedClient, mockedPromptRegistry);

      expect(mockGetServerCapabilities).toHaveBeenCalledOnce();
      expect(mockRequest).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('should log an error if discovery fails', async () => {
      const testError = new Error('test error');
      testError.message = 'test error';
      const mockRequest = vi.fn().mockRejectedValue(testError);
      const mockGetServerCapabilities = vi.fn().mockReturnValue({
        prompts: {},
      });
      const mockedClient = {
        getServerCapabilities: mockGetServerCapabilities,
        request: mockRequest,
      } as unknown as ClientLib.Client;

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await discoverPrompts('test-server', mockedClient, mockedPromptRegistry);

      expect(mockRequest).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Error discovering prompts from test-server: ${testError.message}`,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('appendMcpServerCommand', () => {
    it('should do nothing if no MCP servers or command are configured', () => {
      const out = populateMcpServerCommand({}, undefined);
      expect(out).toEqual({});
    });

    it('should discover tools via mcpServerCommand', () => {
      const commandString = 'command --arg1 value1';
      const out = populateMcpServerCommand({}, commandString);
      expect(out).toEqual({
        mcp: {
          command: 'command',
          args: ['--arg1', 'value1'],
        },
      });
    });

    it('should handle error if mcpServerCommand parsing fails', () => {
      expect(() => populateMcpServerCommand({}, 'derp && herp')).toThrowError();
    });
  });

  describe('createTransport', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = {};
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    describe('should connect via httpUrl', () => {
      it('without headers', async () => {
        const transport = await createTransport(
          'test-server',
          {
            httpUrl: 'http://test-server',
          },
          false,
        );

        expect(transport).toEqual(
          new StreamableHTTPClientTransport(new URL('http://test-server'), {}),
        );
      });

      it('with headers', async () => {
        const transport = await createTransport(
          'test-server',
          {
            httpUrl: 'http://test-server',
            headers: { Authorization: 'derp' },
          },
          false,
        );

        expect(transport).toEqual(
          new StreamableHTTPClientTransport(new URL('http://test-server'), {
            requestInit: {
              headers: { Authorization: 'derp' },
            },
          }),
        );
      });
    });

    describe('should connect via url', () => {
      it('without headers', async () => {
        const transport = await createTransport(
          'test-server',
          {
            url: 'http://test-server',
          },
          false,
        );
        expect(transport).toEqual(
          new SSEClientTransport(new URL('http://test-server'), {}),
        );
      });

      it('with headers', async () => {
        const transport = await createTransport(
          'test-server',
          {
            url: 'http://test-server',
            headers: { Authorization: 'derp' },
          },
          false,
        );

        expect(transport).toEqual(
          new SSEClientTransport(new URL('http://test-server'), {
            requestInit: {
              headers: { Authorization: 'derp' },
            },
          }),
        );
      });
    });

    it('should connect via command', async () => {
      const mockedTransport = vi
        .spyOn(SdkClientStdioLib, 'StdioClientTransport')
        .mockReturnValue({} as SdkClientStdioLib.StdioClientTransport);

      await createTransport(
        'test-server',
        {
          command: 'test-command',
          args: ['--foo', 'bar'],
          env: { FOO: 'bar' },
          cwd: 'test/cwd',
        },
        false,
      );

      expect(mockedTransport).toHaveBeenCalledWith({
        command: 'test-command',
        args: ['--foo', 'bar'],
        cwd: 'test/cwd',
        env: { FOO: 'bar' },
        stderr: 'pipe',
      });
    });

    describe('useGoogleCredentialProvider', () => {
      it('should use GoogleCredentialProvider when specified', async () => {
        const transport = await createTransport(
          'test-server',
          {
            httpUrl: 'http://test-server',
            authProviderType: AuthProviderType.GOOGLE_CREDENTIALS,
            oauth: {
              scopes: ['scope1'],
            },
          },
          false,
        );

        expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const authProvider = (transport as any)._authProvider;
        expect(authProvider).toBeInstanceOf(GoogleCredentialProvider);
      });

      it('should use GoogleCredentialProvider with SSE transport', async () => {
        const transport = await createTransport(
          'test-server',
          {
            url: 'http://test-server',
            authProviderType: AuthProviderType.GOOGLE_CREDENTIALS,
            oauth: {
              scopes: ['scope1'],
            },
          },
          false,
        );

        expect(transport).toBeInstanceOf(SSEClientTransport);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const authProvider = (transport as any)._authProvider;
        expect(authProvider).toBeInstanceOf(GoogleCredentialProvider);
      });

      it('should throw an error if no URL is provided with GoogleCredentialProvider', async () => {
        await expect(
          createTransport(
            'test-server',
            {
              authProviderType: AuthProviderType.GOOGLE_CREDENTIALS,
              oauth: {
                scopes: ['scope1'],
              },
            },
            false,
          ),
        ).rejects.toThrow(
          'No URL configured for Google Credentials MCP server',
        );
      });
    });
  });
  describe('isEnabled', () => {
    const funcDecl = { name: 'myTool' };
    const serverName = 'myServer';

    it('should return true if no include or exclude lists are provided', () => {
      const mcpServerConfig = {};
      expect(isEnabled(funcDecl, serverName, mcpServerConfig)).toBe(true);
    });

    it('should return false if the tool is in the exclude list', () => {
      const mcpServerConfig = { excludeTools: ['myTool'] };
      expect(isEnabled(funcDecl, serverName, mcpServerConfig)).toBe(false);
    });

    it('should return true if the tool is in the include list', () => {
      const mcpServerConfig = { includeTools: ['myTool'] };
      expect(isEnabled(funcDecl, serverName, mcpServerConfig)).toBe(true);
    });

    it('should return true if the tool is in the include list with parentheses', () => {
      const mcpServerConfig = { includeTools: ['myTool()'] };
      expect(isEnabled(funcDecl, serverName, mcpServerConfig)).toBe(true);
    });

    it('should return false if the include list exists but does not contain the tool', () => {
      const mcpServerConfig = { includeTools: ['anotherTool'] };
      expect(isEnabled(funcDecl, serverName, mcpServerConfig)).toBe(false);
    });

    it('should return false if the tool is in both the include and exclude lists', () => {
      const mcpServerConfig = {
        includeTools: ['myTool'],
        excludeTools: ['myTool'],
      };
      expect(isEnabled(funcDecl, serverName, mcpServerConfig)).toBe(false);
    });

    it('should return false if the function declaration has no name', () => {
      const namelessFuncDecl = {};
      const mcpServerConfig = {};
      expect(isEnabled(namelessFuncDecl, serverName, mcpServerConfig)).toBe(
        false,
      );
    });
  });

  describe('hasValidTypes', () => {
    it('should return true for a valid schema with anyOf', () => {
      const schema = {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      };
      expect(hasValidTypes(schema)).toBe(true);
    });

    it('should return false for an invalid schema with anyOf', () => {
      const schema = {
        anyOf: [{ type: 'string' }, { description: 'no type' }],
      };
      expect(hasValidTypes(schema)).toBe(false);
    });

    it('should return true for a valid schema with allOf', () => {
      const schema = {
        allOf: [
          { type: 'string' },
          { type: 'object', properties: { foo: { type: 'string' } } },
        ],
      };
      expect(hasValidTypes(schema)).toBe(true);
    });

    it('should return false for an invalid schema with allOf', () => {
      const schema = {
        allOf: [{ type: 'string' }, { description: 'no type' }],
      };
      expect(hasValidTypes(schema)).toBe(false);
    });

    it('should return true for a valid schema with oneOf', () => {
      const schema = {
        oneOf: [{ type: 'string' }, { type: 'number' }],
      };
      expect(hasValidTypes(schema)).toBe(true);
    });

    it('should return false for an invalid schema with oneOf', () => {
      const schema = {
        oneOf: [{ type: 'string' }, { description: 'no type' }],
      };
      expect(hasValidTypes(schema)).toBe(false);
    });

    it('should return true for a valid schema with nested subschemas', () => {
      const schema = {
        anyOf: [
          { type: 'string' },
          {
            allOf: [
              { type: 'object', properties: { a: { type: 'string' } } },
              { type: 'object', properties: { b: { type: 'number' } } },
            ],
          },
        ],
      };
      expect(hasValidTypes(schema)).toBe(true);
    });

    it('should return false for an invalid schema with nested subschemas', () => {
      const schema = {
        anyOf: [
          { type: 'string' },
          {
            allOf: [
              { type: 'object', properties: { a: { type: 'string' } } },
              { description: 'no type' },
            ],
          },
        ],
      };
      expect(hasValidTypes(schema)).toBe(false);
    });

    it('should return true for a schema with a type and subschemas', () => {
      const schema = {
        type: 'string',
        anyOf: [{ minLength: 1 }, { maxLength: 5 }],
      };
      expect(hasValidTypes(schema)).toBe(true);
    });

    it('should return false for a schema with no type and no subschemas', () => {
      const schema = {
        description: 'a schema with no type',
      };
      expect(hasValidTypes(schema)).toBe(false);
    });

    it('should return true for a valid schema', () => {
      const schema = {
        type: 'object',
        properties: {
          param1: { type: 'string' },
        },
      };
      expect(hasValidTypes(schema)).toBe(true);
    });

    it('should return false if a parameter is missing a type', () => {
      const schema = {
        type: 'object',
        properties: {
          param1: { description: 'a param with no type' },
        },
      };
      expect(hasValidTypes(schema)).toBe(false);
    });

    it('should return false if a nested parameter is missing a type', () => {
      const schema = {
        type: 'object',
        properties: {
          param1: {
            type: 'object',
            properties: {
              nestedParam: {
                description: 'a nested param with no type',
              },
            },
          },
        },
      };
      expect(hasValidTypes(schema)).toBe(false);
    });

    it('should return false if an array item is missing a type', () => {
      const schema = {
        type: 'object',
        properties: {
          param1: {
            type: 'array',
            items: {
              description: 'an array item with no type',
            },
          },
        },
      };
      expect(hasValidTypes(schema)).toBe(false);
    });

    it('should return true for a schema with no properties', () => {
      const schema = {
        type: 'object',
      };
      expect(hasValidTypes(schema)).toBe(true);
    });

    it('should return true for a schema with an empty properties object', () => {
      const schema = {
        type: 'object',
        properties: {},
      };
      expect(hasValidTypes(schema)).toBe(true);
    });
  });
});
