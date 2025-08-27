/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  populateMcpServerCommand,
  createTransport,
  isEnabled,
  hasValidTypes,
  McpClient,
  hasNetworkTransport,
} from './mcp-client.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import * as SdkClientStdioLib from '@modelcontextprotocol/sdk/client/stdio.js';
import * as ClientLib from '@modelcontextprotocol/sdk/client/index.js';
import * as GenAiLib from '@google/genai';
import { GoogleCredentialProvider } from '../mcp/google-auth-provider.js';
import { AuthProviderType } from '../config/config.js';
import type { PromptRegistry } from '../prompts/prompt-registry.js';
import type { ToolRegistry } from './tool-registry.js';
import type { WorkspaceContext } from '../utils/workspaceContext.js';

vi.mock('@modelcontextprotocol/sdk/client/stdio.js');
vi.mock('@modelcontextprotocol/sdk/client/index.js');
vi.mock('@google/genai');
vi.mock('../mcp/oauth-provider.js');
vi.mock('../mcp/oauth-token-storage.js');

describe('mcp-client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('McpClient', () => {
    it('should discover tools', async () => {
      const mockedClient = {
        connect: vi.fn(),
        discover: vi.fn(),
        disconnect: vi.fn(),
        getStatus: vi.fn(),
        registerCapabilities: vi.fn(),
        setRequestHandler: vi.fn(),
      };
      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
      const mockedMcpToTool = vi.mocked(GenAiLib.mcpToTool).mockReturnValue({
        tool: () => ({
          functionDeclarations: [
            {
              name: 'testFunction',
            },
          ],
        }),
      } as unknown as GenAiLib.CallableTool);
      const mockedToolRegistry = {
        registerTool: vi.fn(),
      } as unknown as ToolRegistry;
      const client = new McpClient(
        'test-server',
        {
          command: 'test-command',
        },
        mockedToolRegistry,
        {} as PromptRegistry,
        {} as WorkspaceContext,
        false,
      );
      await client.connect();
      await client.discover();
      expect(mockedMcpToTool).toHaveBeenCalledOnce();
    });

    it('should skip tools if a parameter is missing a type', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const mockedClient = {
        connect: vi.fn(),
        discover: vi.fn(),
        disconnect: vi.fn(),
        getStatus: vi.fn(),
        registerCapabilities: vi.fn(),
        setRequestHandler: vi.fn(),
        tool: vi.fn(),
      };
      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
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
      const mockedToolRegistry = {
        registerTool: vi.fn(),
      } as unknown as ToolRegistry;
      const client = new McpClient(
        'test-server',
        {
          command: 'test-command',
        },
        mockedToolRegistry,
        {} as PromptRegistry,
        {} as WorkspaceContext,
        false,
      );
      await client.connect();
      await client.discover();
      expect(mockedToolRegistry.registerTool).toHaveBeenCalledOnce();
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `Skipping tool 'invalidTool' from MCP server 'test-server' because it has ` +
          `missing types in its parameter schema. Please file an issue with the owner of the MCP server.`,
      );
      consoleWarnSpy.mockRestore();
    });

    it('should handle errors when discovering prompts', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const mockedClient = {
        connect: vi.fn(),
        discover: vi.fn(),
        disconnect: vi.fn(),
        getStatus: vi.fn(),
        registerCapabilities: vi.fn(),
        setRequestHandler: vi.fn(),
        getServerCapabilities: vi.fn().mockReturnValue({ prompts: {} }),
        request: vi.fn().mockRejectedValue(new Error('Test error')),
      };
      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
      vi.mocked(GenAiLib.mcpToTool).mockReturnValue({
        tool: () => Promise.resolve({ functionDeclarations: [] }),
      } as unknown as GenAiLib.CallableTool);
      const client = new McpClient(
        'test-server',
        {
          command: 'test-command',
        },
        {} as ToolRegistry,
        {} as PromptRegistry,
        {} as WorkspaceContext,
        false,
      );
      await client.connect();
      await expect(client.discover()).rejects.toThrow(
        'No prompts or tools found on the server.',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Error discovering prompts from test-server: Test error`,
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
        env: { ...process.env, FOO: 'bar' },
        stderr: 'pipe',
      });
    });

    describe('useGoogleCredentialProvider', () => {
      it('should use GoogleCredentialProvider when specified', async () => {
        const transport = await createTransport(
          'test-server',
          {
            httpUrl: 'http://test.googleapis.com',
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
            url: 'http://test.googleapis.com',
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
          'URL must be provided in the config for Google Credentials provider',
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

  describe('hasNetworkTransport', () => {
    it('should return true if only url is provided', () => {
      const config = { url: 'http://example.com' };
      expect(hasNetworkTransport(config)).toBe(true);
    });

    it('should return true if only httpUrl is provided', () => {
      const config = { httpUrl: 'http://example.com' };
      expect(hasNetworkTransport(config)).toBe(true);
    });

    it('should return true if both url and httpUrl are provided', () => {
      const config = {
        url: 'http://example.com/sse',
        httpUrl: 'http://example.com/http',
      };
      expect(hasNetworkTransport(config)).toBe(true);
    });

    it('should return false if neither url nor httpUrl is provided', () => {
      const config = { command: 'do-something' };
      expect(hasNetworkTransport(config)).toBe(false);
    });

    it('should return false for an empty config object', () => {
      const config = {};
      expect(hasNetworkTransport(config)).toBe(false);
    });
  });
});
