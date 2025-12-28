/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as ClientLib from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import * as SdkClientStdioLib from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProviderType, type Config } from '../config/config.js';
import { GoogleCredentialProvider } from '../mcp/google-auth-provider.js';
import { MCPOAuthProvider } from '../mcp/oauth-provider.js';
import { MCPOAuthTokenStorage } from '../mcp/oauth-token-storage.js';
import { OAuthUtils } from '../mcp/oauth-utils.js';
import type { PromptRegistry } from '../prompts/prompt-registry.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

import { WorkspaceContext } from '../utils/workspaceContext.js';
import {
  connectToMcpServer,
  createTransport,
  hasNetworkTransport,
  isEnabled,
  McpClient,
  populateMcpServerCommand,
} from './mcp-client.js';
import type { ToolRegistry } from './tool-registry.js';
import type { ResourceRegistry } from '../resources/resource-registry.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { coreEvents } from '../utils/events.js';
import type { EnvironmentSanitizationConfig } from '../services/environmentSanitization.js';

const EMPTY_CONFIG: EnvironmentSanitizationConfig = {
  enableEnvironmentVariableRedaction: true,
  allowedEnvironmentVariables: [],
  blockedEnvironmentVariables: [],
};

vi.mock('@modelcontextprotocol/sdk/client/stdio.js');
vi.mock('@modelcontextprotocol/sdk/client/index.js');
vi.mock('@google/genai');
vi.mock('../mcp/oauth-provider.js');
vi.mock('../mcp/oauth-token-storage.js');
vi.mock('../mcp/oauth-utils.js');
vi.mock('google-auth-library');
import { GoogleAuth } from 'google-auth-library';

vi.mock('../utils/events.js', () => ({
  coreEvents: {
    emitFeedback: vi.fn(),
    emitConsoleLog: vi.fn(),
  },
}));

describe('mcp-client', () => {
  let workspaceContext: WorkspaceContext;
  let testWorkspace: string;

  beforeEach(() => {
    // create a tmp dir for this test
    // Create a unique temporary directory for the workspace to avoid conflicts
    testWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-agent-test-'),
    );
    workspaceContext = new WorkspaceContext(testWorkspace);
  });

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
        setNotificationHandler: vi.fn(),
        getServerCapabilities: vi.fn().mockReturnValue({ tools: {} }),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: 'testFunction',
              inputSchema: {
                type: 'object',
                properties: {},
              },
            },
          ],
        }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [],
        }),
        request: vi.fn().mockResolvedValue({}),
      };
      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
      const mockedToolRegistry = {
        registerTool: vi.fn(),
        sortTools: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;
      const promptRegistry = {
        registerPrompt: vi.fn(),
        removePromptsByServer: vi.fn(),
      } as unknown as PromptRegistry;
      const resourceRegistry = {
        setResourcesForServer: vi.fn(),
        removeResourcesByServer: vi.fn(),
      } as unknown as ResourceRegistry;
      const client = new McpClient(
        'test-server',
        {
          command: 'test-command',
        },
        mockedToolRegistry,
        promptRegistry,
        resourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );
      await client.connect();
      await client.discover({} as Config);
      expect(mockedClient.listTools).toHaveBeenCalledWith(
        {},
        { timeout: 600000 },
      );
    });

    it('should not skip tools even if a parameter is missing a type', async () => {
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
        setNotificationHandler: vi.fn(),
        getServerCapabilities: vi.fn().mockReturnValue({ tools: {} }),

        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: 'validTool',
              inputSchema: {
                type: 'object',
                properties: {
                  param1: { type: 'string' },
                },
              },
            },
            {
              name: 'invalidTool',
              inputSchema: {
                type: 'object',
                properties: {
                  param1: { description: 'a param with no type' },
                },
              },
            },
          ],
        }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [],
        }),
        request: vi.fn().mockResolvedValue({}),
      };
      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
      const mockedToolRegistry = {
        registerTool: vi.fn(),
        sortTools: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;
      const promptRegistry = {
        registerPrompt: vi.fn(),
        removePromptsByServer: vi.fn(),
      } as unknown as PromptRegistry;
      const resourceRegistry = {
        setResourcesForServer: vi.fn(),
        removeResourcesByServer: vi.fn(),
      } as unknown as ResourceRegistry;
      const client = new McpClient(
        'test-server',
        {
          command: 'test-command',
        },
        mockedToolRegistry,
        promptRegistry,
        resourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );
      await client.connect();
      await client.discover({} as Config);
      expect(mockedToolRegistry.registerTool).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it('should handle errors when discovering prompts', async () => {
      const mockedClient = {
        connect: vi.fn(),
        discover: vi.fn(),
        disconnect: vi.fn(),
        getStatus: vi.fn(),
        registerCapabilities: vi.fn(),
        setRequestHandler: vi.fn(),
        setNotificationHandler: vi.fn(),
        getServerCapabilities: vi.fn().mockReturnValue({ prompts: {} }),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listPrompts: vi.fn().mockRejectedValue(new Error('Test error')),
        request: vi.fn().mockResolvedValue({}),
      };
      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
      const mockedToolRegistry = {
        registerTool: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;
      const promptRegistry = {
        registerPrompt: vi.fn(),
        removePromptsByServer: vi.fn(),
      } as unknown as PromptRegistry;
      const resourceRegistry = {
        setResourcesForServer: vi.fn(),
        removeResourcesByServer: vi.fn(),
      } as unknown as ResourceRegistry;
      const client = new McpClient(
        'test-server',
        {
          command: 'test-command',
        },
        mockedToolRegistry,
        promptRegistry,
        resourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );
      await client.connect();
      await expect(client.discover({} as Config)).rejects.toThrow(
        'No prompts, tools, or resources found on the server.',
      );
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        `Error discovering prompts from test-server: Test error`,
        expect.any(Error),
      );
    });

    it('should not discover tools if server does not support them', async () => {
      const mockedClient = {
        connect: vi.fn(),
        discover: vi.fn(),
        disconnect: vi.fn(),
        getStatus: vi.fn(),
        registerCapabilities: vi.fn(),
        setRequestHandler: vi.fn(),
        setNotificationHandler: vi.fn(),
        getServerCapabilities: vi.fn().mockReturnValue({ prompts: {} }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
        request: vi.fn().mockResolvedValue({}),
      };
      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
      const mockedToolRegistry = {
        registerTool: vi.fn(),
        sortTools: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;
      const promptRegistry = {
        registerPrompt: vi.fn(),
        removePromptsByServer: vi.fn(),
      } as unknown as PromptRegistry;
      const resourceRegistry = {
        setResourcesForServer: vi.fn(),
        removeResourcesByServer: vi.fn(),
      } as unknown as ResourceRegistry;
      const client = new McpClient(
        'test-server',
        {
          command: 'test-command',
        },
        mockedToolRegistry,
        promptRegistry,
        resourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );
      await client.connect();
      await expect(client.discover({} as Config)).rejects.toThrow(
        'No prompts, tools, or resources found on the server.',
      );
    });

    it('should discover tools if server supports them', async () => {
      const mockedClient = {
        connect: vi.fn(),
        discover: vi.fn(),
        disconnect: vi.fn(),
        getStatus: vi.fn(),
        registerCapabilities: vi.fn(),
        setRequestHandler: vi.fn(),
        setNotificationHandler: vi.fn(),
        getServerCapabilities: vi.fn().mockReturnValue({ tools: {} }),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: 'testTool',
              description: 'A test tool',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
        request: vi.fn().mockResolvedValue({}),
      };
      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
      const mockedToolRegistry = {
        registerTool: vi.fn(),
        sortTools: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;
      const promptRegistry = {
        registerPrompt: vi.fn(),
        removePromptsByServer: vi.fn(),
      } as unknown as PromptRegistry;
      const resourceRegistry = {
        setResourcesForServer: vi.fn(),
        removeResourcesByServer: vi.fn(),
      } as unknown as ResourceRegistry;
      const client = new McpClient(
        'test-server',
        {
          command: 'test-command',
        },
        mockedToolRegistry,
        promptRegistry,
        resourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );
      await client.connect();
      await client.discover({} as Config);
      expect(mockedToolRegistry.registerTool).toHaveBeenCalledOnce();
    });

    it('should discover tools with $defs and $ref in schema', async () => {
      const mockedClient = {
        connect: vi.fn(),
        discover: vi.fn(),
        disconnect: vi.fn(),
        getStatus: vi.fn(),
        registerCapabilities: vi.fn(),
        setRequestHandler: vi.fn(),
        setNotificationHandler: vi.fn(),
        getServerCapabilities: vi.fn().mockReturnValue({ tools: {} }),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: 'toolWithDefs',
              description: 'A tool using $defs',
              inputSchema: {
                type: 'object',
                properties: {
                  param1: {
                    $ref: '#/$defs/MyType',
                  },
                },
                $defs: {
                  MyType: {
                    type: 'string',
                    description: 'A defined type',
                  },
                },
              },
            },
          ],
        }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [],
        }),
        request: vi.fn().mockResolvedValue({}),
      };
      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
      const mockedToolRegistry = {
        registerTool: vi.fn(),
        sortTools: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;
      const promptRegistry = {
        registerPrompt: vi.fn(),
        removePromptsByServer: vi.fn(),
      } as unknown as PromptRegistry;
      const resourceRegistry = {
        setResourcesForServer: vi.fn(),
        removeResourcesByServer: vi.fn(),
      } as unknown as ResourceRegistry;
      const client = new McpClient(
        'test-server',
        {
          command: 'test-command',
        },
        mockedToolRegistry,
        promptRegistry,
        resourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );
      await client.connect();
      await client.discover({} as Config);
      expect(mockedToolRegistry.registerTool).toHaveBeenCalledOnce();
      const registeredTool = vi.mocked(mockedToolRegistry.registerTool).mock
        .calls[0][0];
      expect(registeredTool.schema.parametersJsonSchema).toEqual({
        type: 'object',
        properties: {
          param1: {
            $ref: '#/$defs/MyType',
          },
        },
        $defs: {
          MyType: {
            type: 'string',
            description: 'A defined type',
          },
        },
      });
    });

    it('should discover resources when a server only exposes resources', async () => {
      const mockedClient = {
        connect: vi.fn(),
        discover: vi.fn(),
        disconnect: vi.fn(),
        getStatus: vi.fn(),
        registerCapabilities: vi.fn(),
        setRequestHandler: vi.fn(),
        setNotificationHandler: vi.fn(),
        getServerCapabilities: vi.fn().mockReturnValue({ resources: {} }),
        request: vi.fn().mockImplementation(({ method }) => {
          if (method === 'resources/list') {
            return Promise.resolve({
              resources: [
                {
                  uri: 'file:///tmp/resource.txt',
                  name: 'resource',
                  description: 'Test Resource',
                  mimeType: 'text/plain',
                },
              ],
            });
          }
          return Promise.resolve({ prompts: [] });
        }),
      } as unknown as ClientLib.Client;
      vi.mocked(ClientLib.Client).mockReturnValue(mockedClient);
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
      const mockedToolRegistry = {
        registerTool: vi.fn(),
        sortTools: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;
      const promptRegistry = {
        registerPrompt: vi.fn(),
        removePromptsByServer: vi.fn(),
      } as unknown as PromptRegistry;
      const resourceRegistry = {
        setResourcesForServer: vi.fn(),
        removeResourcesByServer: vi.fn(),
      } as unknown as ResourceRegistry;
      const client = new McpClient(
        'test-server',
        {
          command: 'test-command',
        },
        mockedToolRegistry,
        promptRegistry,
        resourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );
      await client.connect();
      await client.discover({} as Config);
      expect(resourceRegistry.setResourcesForServer).toHaveBeenCalledWith(
        'test-server',
        [
          expect.objectContaining({
            uri: 'file:///tmp/resource.txt',
            name: 'resource',
          }),
        ],
      );
    });

    it('refreshes registry when resource list change notification is received', async () => {
      let listCallCount = 0;
      let resourceListHandler:
        | ((notification: unknown) => Promise<void> | void)
        | undefined;
      const mockedClient = {
        connect: vi.fn(),
        discover: vi.fn(),
        disconnect: vi.fn(),
        getStatus: vi.fn(),
        registerCapabilities: vi.fn(),
        setRequestHandler: vi.fn(),
        setNotificationHandler: vi.fn((_, handler) => {
          resourceListHandler = handler;
        }),
        getServerCapabilities: vi
          .fn()
          .mockReturnValue({ resources: { listChanged: true } }),
        request: vi.fn().mockImplementation(({ method }) => {
          if (method === 'resources/list') {
            listCallCount += 1;
            if (listCallCount === 1) {
              return Promise.resolve({
                resources: [
                  {
                    uri: 'file:///tmp/one.txt',
                  },
                ],
              });
            }
            return Promise.resolve({
              resources: [
                {
                  uri: 'file:///tmp/two.txt',
                },
              ],
            });
          }
          return Promise.resolve({ prompts: [] });
        }),
      } as unknown as ClientLib.Client;
      vi.mocked(ClientLib.Client).mockReturnValue(mockedClient);
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
      const mockedToolRegistry = {
        registerTool: vi.fn(),
        sortTools: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;
      const promptRegistry = {
        registerPrompt: vi.fn(),
        removePromptsByServer: vi.fn(),
      } as unknown as PromptRegistry;
      const resourceRegistry = {
        setResourcesForServer: vi.fn(),
        removeResourcesByServer: vi.fn(),
      } as unknown as ResourceRegistry;
      const client = new McpClient(
        'test-server',
        {
          command: 'test-command',
        },
        mockedToolRegistry,
        promptRegistry,
        resourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );
      await client.connect();
      await client.discover({} as Config);

      expect(mockedClient.setNotificationHandler).toHaveBeenCalledOnce();
      expect(resourceListHandler).toBeDefined();

      await resourceListHandler?.({
        method: 'notifications/resources/list_changed',
      });

      expect(resourceRegistry.setResourcesForServer).toHaveBeenLastCalledWith(
        'test-server',
        [expect.objectContaining({ uri: 'file:///tmp/two.txt' })],
      );

      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'info',
        'Resources updated for server: test-server',
      );
    });

    it('should remove tools and prompts on disconnect', async () => {
      const mockedClient = {
        connect: vi.fn(),
        close: vi.fn(),
        getStatus: vi.fn(),
        registerCapabilities: vi.fn(),
        setRequestHandler: vi.fn(),
        setNotificationHandler: vi.fn(),
        getServerCapabilities: vi
          .fn()
          .mockReturnValue({ tools: {}, prompts: {} }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [{ id: 'prompt1', text: 'a prompt' }],
        }),
        request: vi.fn().mockResolvedValue({}),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: 'testTool',
              description: 'A test tool',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        }),
      };
      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );
      const mockedToolRegistry = {
        registerTool: vi.fn(),
        unregisterTool: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
        removeMcpToolsByServer: vi.fn(),
        sortTools: vi.fn(),
      } as unknown as ToolRegistry;
      const mockedPromptRegistry = {
        registerPrompt: vi.fn(),
        unregisterPrompt: vi.fn(),
        removePromptsByServer: vi.fn(),
      } as unknown as PromptRegistry;
      const resourceRegistry = {
        setResourcesForServer: vi.fn(),
        removeResourcesByServer: vi.fn(),
      } as unknown as ResourceRegistry;
      const client = new McpClient(
        'test-server',
        {
          command: 'test-command',
        },
        mockedToolRegistry,
        mockedPromptRegistry,
        resourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );
      await client.connect();
      await client.discover({} as Config);

      expect(mockedToolRegistry.registerTool).toHaveBeenCalledOnce();
      expect(mockedPromptRegistry.registerPrompt).toHaveBeenCalledOnce();

      await client.disconnect();

      expect(mockedClient.close).toHaveBeenCalledOnce();
      expect(mockedToolRegistry.removeMcpToolsByServer).toHaveBeenCalledOnce();
      expect(mockedPromptRegistry.removePromptsByServer).toHaveBeenCalledOnce();
      expect(resourceRegistry.removeResourcesByServer).toHaveBeenCalledOnce();
    });
  });

  describe('Dynamic Tool Updates', () => {
    it('should set up notification handler if server supports tool list changes', async () => {
      const mockedClient = {
        connect: vi.fn(),
        getStatus: vi.fn(),
        registerCapabilities: vi.fn(),
        setRequestHandler: vi.fn(),
        // Capability enables the listener
        getServerCapabilities: vi
          .fn()
          .mockReturnValue({ tools: { listChanged: true } }),
        setNotificationHandler: vi.fn(),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
        request: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );

      const client = new McpClient(
        'test-server',
        { command: 'test-command' },
        {} as ToolRegistry,
        {} as PromptRegistry,
        {} as ResourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );

      await client.connect();

      expect(mockedClient.setNotificationHandler).toHaveBeenCalledWith(
        ToolListChangedNotificationSchema,
        expect.any(Function),
      );
    });

    it('should NOT set up notification handler if server lacks capability', async () => {
      const mockedClient = {
        connect: vi.fn(),
        getServerCapabilities: vi.fn().mockReturnValue({ tools: {} }), // No listChanged
        setNotificationHandler: vi.fn(),
        request: vi.fn().mockResolvedValue({}),
        registerCapabilities: vi.fn().mockResolvedValue({}),
        setRequestHandler: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );

      const client = new McpClient(
        'test-server',
        { command: 'test-command' },
        {} as ToolRegistry,
        {} as PromptRegistry,
        {} as ResourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );

      await client.connect();

      expect(mockedClient.setNotificationHandler).not.toHaveBeenCalled();
    });

    it('should refresh tools and notify manager when notification is received', async () => {
      // Setup mocks
      const mockedClient = {
        connect: vi.fn(),
        getServerCapabilities: vi
          .fn()
          .mockReturnValue({ tools: { listChanged: true } }),
        setNotificationHandler: vi.fn(),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: 'newTool',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
        request: vi.fn().mockResolvedValue({}),
        registerCapabilities: vi.fn().mockResolvedValue({}),
        setRequestHandler: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );

      const mockedToolRegistry = {
        removeMcpToolsByServer: vi.fn(),
        registerTool: vi.fn(),
        sortTools: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;

      const onToolsUpdatedSpy = vi.fn().mockResolvedValue(undefined);

      // Initialize client with onToolsUpdated callback
      const client = new McpClient(
        'test-server',
        { command: 'test-command' },
        mockedToolRegistry,
        {} as PromptRegistry,
        {} as ResourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
        onToolsUpdatedSpy,
      );

      // 1. Connect (sets up listener)
      await client.connect();

      // 2. Extract the callback passed to setNotificationHandler
      const notificationCallback =
        mockedClient.setNotificationHandler.mock.calls[0][1];

      // 3. Trigger the notification manually
      await notificationCallback();

      // 4. Assertions
      // It should clear old tools
      expect(mockedToolRegistry.removeMcpToolsByServer).toHaveBeenCalledWith(
        'test-server',
      );

      // It should fetch new tools (listTools called inside discoverTools)
      expect(mockedClient.listTools).toHaveBeenCalled();

      // It should register the new tool
      expect(mockedToolRegistry.registerTool).toHaveBeenCalled();

      // It should notify the manager
      expect(onToolsUpdatedSpy).toHaveBeenCalled();

      // It should emit feedback event
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'info',
        'Tools updated for server: test-server',
      );
    });

    it('should handle errors during tool refresh gracefully', async () => {
      const mockedClient = {
        connect: vi.fn(),
        getServerCapabilities: vi
          .fn()
          .mockReturnValue({ tools: { listChanged: true } }),
        setNotificationHandler: vi.fn(),
        // Simulate error during discovery
        listTools: vi.fn().mockRejectedValue(new Error('Network blip')),
        request: vi.fn().mockResolvedValue({}),
        registerCapabilities: vi.fn().mockResolvedValue({}),
        setRequestHandler: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );

      const mockedToolRegistry = {
        removeMcpToolsByServer: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;

      const client = new McpClient(
        'test-server',
        { command: 'test-command' },
        mockedToolRegistry,
        {} as PromptRegistry,
        {} as ResourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );

      await client.connect();

      const notificationCallback =
        mockedClient.setNotificationHandler.mock.calls[0][1];

      // Trigger notification - should fail internally but catch the error
      await notificationCallback();

      // Should try to remove tools
      expect(mockedToolRegistry.removeMcpToolsByServer).toHaveBeenCalled();

      // Should NOT emit success feedback
      expect(coreEvents.emitFeedback).not.toHaveBeenCalledWith(
        'info',
        expect.stringContaining('Tools updated'),
      );
    });

    it('should handle concurrent updates from multiple servers', async () => {
      const createMockSdkClient = (toolName: string) => ({
        connect: vi.fn(),
        getServerCapabilities: vi
          .fn()
          .mockReturnValue({ tools: { listChanged: true } }),
        setNotificationHandler: vi.fn(),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: toolName,
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
        request: vi.fn().mockResolvedValue({}),
        registerCapabilities: vi.fn().mockResolvedValue({}),
        setRequestHandler: vi.fn().mockResolvedValue({}),
      });

      const mockClientA = createMockSdkClient('tool-from-A');
      const mockClientB = createMockSdkClient('tool-from-B');

      vi.mocked(ClientLib.Client)
        .mockReturnValueOnce(mockClientA as unknown as ClientLib.Client)
        .mockReturnValueOnce(mockClientB as unknown as ClientLib.Client);

      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );

      const mockedToolRegistry = {
        removeMcpToolsByServer: vi.fn(),
        registerTool: vi.fn(),
        sortTools: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;

      const onToolsUpdatedSpy = vi.fn().mockResolvedValue(undefined);

      const clientA = new McpClient(
        'server-A',
        { command: 'cmd-a' },
        mockedToolRegistry,
        {} as PromptRegistry,
        {} as ResourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
        onToolsUpdatedSpy,
      );

      const clientB = new McpClient(
        'server-B',
        { command: 'cmd-b' },
        mockedToolRegistry,
        {} as PromptRegistry,
        {} as ResourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
        onToolsUpdatedSpy,
      );

      await clientA.connect();
      await clientB.connect();

      const handlerA = mockClientA.setNotificationHandler.mock.calls[0][1];
      const handlerB = mockClientB.setNotificationHandler.mock.calls[0][1];

      // Trigger burst updates simultaneously
      await Promise.all([handlerA(), handlerB()]);

      expect(mockedToolRegistry.removeMcpToolsByServer).toHaveBeenCalledWith(
        'server-A',
      );
      expect(mockedToolRegistry.removeMcpToolsByServer).toHaveBeenCalledWith(
        'server-B',
      );

      // Verify fetching happened on both clients
      expect(mockClientA.listTools).toHaveBeenCalled();
      expect(mockClientB.listTools).toHaveBeenCalled();

      // Verify tools from both servers were registered (2 total calls)
      expect(mockedToolRegistry.registerTool).toHaveBeenCalledTimes(2);

      // Verify the update callback was triggered for both
      expect(onToolsUpdatedSpy).toHaveBeenCalledTimes(2);
    });

    it('should abort discovery and log error if timeout is exceeded during refresh', async () => {
      vi.useFakeTimers();

      const mockedClient = {
        connect: vi.fn(),
        getServerCapabilities: vi
          .fn()
          .mockReturnValue({ tools: { listChanged: true } }),
        setNotificationHandler: vi.fn(),
        // Mock listTools to simulate a long running process that respects the abort signal
        listTools: vi.fn().mockImplementation(
          async (params, options) =>
            new Promise((resolve, reject) => {
              if (options?.signal?.aborted) {
                return reject(new Error('Operation aborted'));
              }
              options?.signal?.addEventListener('abort', () => {
                reject(new Error('Operation aborted'));
              });
              // Intentionally do not resolve immediately to simulate lag
            }),
        ),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
        request: vi.fn().mockResolvedValue({}),
        registerCapabilities: vi.fn().mockResolvedValue({}),
        setRequestHandler: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );

      const mockedToolRegistry = {
        removeMcpToolsByServer: vi.fn(),
        registerTool: vi.fn(),
        sortTools: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;

      const client = new McpClient(
        'test-server',
        // Set a short timeout
        { command: 'test-command', timeout: 100 },
        mockedToolRegistry,
        {} as PromptRegistry,
        {} as ResourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
      );

      await client.connect();

      const notificationCallback =
        mockedClient.setNotificationHandler.mock.calls[0][1];

      const refreshPromise = notificationCallback();

      vi.advanceTimersByTime(150);

      await refreshPromise;

      expect(mockedClient.listTools).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );

      expect(mockedToolRegistry.registerTool).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should pass abort signal to onToolsUpdated callback', async () => {
      const mockedClient = {
        connect: vi.fn(),
        getServerCapabilities: vi
          .fn()
          .mockReturnValue({ tools: { listChanged: true } }),
        setNotificationHandler: vi.fn(),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
        request: vi.fn().mockResolvedValue({}),
        registerCapabilities: vi.fn().mockResolvedValue({}),
        setRequestHandler: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(ClientLib.Client).mockReturnValue(
        mockedClient as unknown as ClientLib.Client,
      );
      vi.spyOn(SdkClientStdioLib, 'StdioClientTransport').mockReturnValue(
        {} as SdkClientStdioLib.StdioClientTransport,
      );

      const mockedToolRegistry = {
        removeMcpToolsByServer: vi.fn(),
        registerTool: vi.fn(),
        sortTools: vi.fn(),
        getMessageBus: vi.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;

      const onToolsUpdatedSpy = vi.fn().mockResolvedValue(undefined);

      const client = new McpClient(
        'test-server',
        { command: 'test-command' },
        mockedToolRegistry,
        {} as PromptRegistry,
        {} as ResourceRegistry,
        workspaceContext,
        { sanitizationConfig: EMPTY_CONFIG } as Config,
        false,
        onToolsUpdatedSpy,
      );

      await client.connect();

      const notificationCallback =
        mockedClient.setNotificationHandler.mock.calls[0][1];

      await notificationCallback();

      expect(onToolsUpdatedSpy).toHaveBeenCalledWith(expect.any(AbortSignal));

      // Verify the signal passed was not aborted (happy path)
      const signal = onToolsUpdatedSpy.mock.calls[0][0];
      expect(signal.aborted).toBe(false);
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
          EMPTY_CONFIG,
        );

        expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
        expect(transport).toMatchObject({
          _url: new URL('http://test-server'),
          _requestInit: { headers: {} },
        });
      });

      it('with headers', async () => {
        const transport = await createTransport(
          'test-server',
          {
            httpUrl: 'http://test-server',
            headers: { Authorization: 'derp' },
          },
          false,
          EMPTY_CONFIG,
        );

        expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
        expect(transport).toMatchObject({
          _url: new URL('http://test-server'),
          _requestInit: {
            headers: { Authorization: 'derp' },
          },
        });
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
          EMPTY_CONFIG,
        );
        expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
        expect(transport).toMatchObject({
          _url: new URL('http://test-server'),
          _requestInit: { headers: {} },
        });
      });

      it('with headers', async () => {
        const transport = await createTransport(
          'test-server',
          {
            url: 'http://test-server',
            headers: { Authorization: 'derp' },
          },
          false,
          EMPTY_CONFIG,
        );

        expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
        expect(transport).toMatchObject({
          _url: new URL('http://test-server'),
          _requestInit: {
            headers: { Authorization: 'derp' },
          },
        });
      });

      it('with type="http" creates StreamableHTTPClientTransport', async () => {
        const transport = await createTransport(
          'test-server',
          {
            url: 'http://test-server',
            type: 'http',
          },
          false,
          EMPTY_CONFIG,
        );

        expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
        expect(transport).toMatchObject({
          _url: new URL('http://test-server'),
          _requestInit: { headers: {} },
        });
      });

      it('with type="sse" creates SSEClientTransport', async () => {
        const transport = await createTransport(
          'test-server',
          {
            url: 'http://test-server',
            type: 'sse',
          },
          false,
          EMPTY_CONFIG,
        );

        expect(transport).toBeInstanceOf(SSEClientTransport);
        expect(transport).toMatchObject({
          _url: new URL('http://test-server'),
          _requestInit: { headers: {} },
        });
      });

      it('without type defaults to StreamableHTTPClientTransport', async () => {
        const transport = await createTransport(
          'test-server',
          {
            url: 'http://test-server',
          },
          false,
          EMPTY_CONFIG,
        );

        expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
        expect(transport).toMatchObject({
          _url: new URL('http://test-server'),
          _requestInit: { headers: {} },
        });
      });

      it('with type="http" and headers applies headers correctly', async () => {
        const transport = await createTransport(
          'test-server',
          {
            url: 'http://test-server',
            type: 'http',
            headers: { Authorization: 'Bearer token' },
          },
          false,
          EMPTY_CONFIG,
        );

        expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
        expect(transport).toMatchObject({
          _url: new URL('http://test-server'),
          _requestInit: {
            headers: { Authorization: 'Bearer token' },
          },
        });
      });

      it('with type="sse" and headers applies headers correctly', async () => {
        const transport = await createTransport(
          'test-server',
          {
            url: 'http://test-server',
            type: 'sse',
            headers: { 'X-API-Key': 'key123' },
          },
          false,
          EMPTY_CONFIG,
        );

        expect(transport).toBeInstanceOf(SSEClientTransport);
        expect(transport).toMatchObject({
          _url: new URL('http://test-server'),
          _requestInit: {
            headers: { 'X-API-Key': 'key123' },
          },
        });
      });

      it('httpUrl takes priority over url when both are present', async () => {
        const transport = await createTransport(
          'test-server',
          {
            httpUrl: 'http://test-server-http',
            url: 'http://test-server-url',
          },
          false,
          EMPTY_CONFIG,
        );

        // httpUrl should take priority and create HTTP transport
        expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
        expect(transport).toMatchObject({
          _url: new URL('http://test-server-http'),
          _requestInit: { headers: {} },
        });
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
        EMPTY_CONFIG,
      );

      expect(mockedTransport).toHaveBeenCalledWith({
        command: 'test-command',
        args: ['--foo', 'bar'],
        cwd: 'test/cwd',
        env: expect.objectContaining({ FOO: 'bar' }),
        stderr: 'pipe',
      });
    });

    describe('useGoogleCredentialProvider', () => {
      beforeEach(() => {
        // Mock GoogleAuth client
        const mockClient = {
          getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token' }),
          quotaProjectId: 'myproject',
        };

        GoogleAuth.prototype.getClient = vi.fn().mockResolvedValue(mockClient);
      });

      it('should use GoogleCredentialProvider when specified', async () => {
        const transport = await createTransport(
          'test-server',
          {
            httpUrl: 'http://test.googleapis.com',
            authProviderType: AuthProviderType.GOOGLE_CREDENTIALS,
            oauth: {
              scopes: ['scope1'],
            },
            headers: {
              'X-Goog-User-Project': 'myproject',
            },
          },
          false,
          EMPTY_CONFIG,
        );

        expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const authProvider = (transport as any)._authProvider;
        expect(authProvider).toBeInstanceOf(GoogleCredentialProvider);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const googUserProject = (transport as any)._requestInit?.headers?.[
          'X-Goog-User-Project'
        ];
        expect(googUserProject).toBe('myproject');
      });

      it('should use headers from GoogleCredentialProvider', async () => {
        const mockGetRequestHeaders = vi.fn().mockResolvedValue({
          'X-Goog-User-Project': 'provider-project',
        });
        vi.spyOn(
          GoogleCredentialProvider.prototype,
          'getRequestHeaders',
        ).mockImplementation(mockGetRequestHeaders);

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
          EMPTY_CONFIG,
        );

        expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
        expect(mockGetRequestHeaders).toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const headers = (transport as any)._requestInit?.headers;
        expect(headers['X-Goog-User-Project']).toBe('provider-project');
      });

      it('should prioritize provider headers over config headers', async () => {
        const mockGetRequestHeaders = vi.fn().mockResolvedValue({
          'X-Goog-User-Project': 'provider-project',
        });
        vi.spyOn(
          GoogleCredentialProvider.prototype,
          'getRequestHeaders',
        ).mockImplementation(mockGetRequestHeaders);

        const transport = await createTransport(
          'test-server',
          {
            httpUrl: 'http://test.googleapis.com',
            authProviderType: AuthProviderType.GOOGLE_CREDENTIALS,
            oauth: {
              scopes: ['scope1'],
            },
            headers: {
              'X-Goog-User-Project': 'config-project',
            },
          },
          false,
          EMPTY_CONFIG,
        );

        expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const headers = (transport as any)._requestInit?.headers;
        expect(headers['X-Goog-User-Project']).toBe('provider-project');
      });

      it('should use GoogleCredentialProvider with SSE transport', async () => {
        const transport = await createTransport(
          'test-server',
          {
            url: 'http://test.googleapis.com',
            type: 'sse',
            authProviderType: AuthProviderType.GOOGLE_CREDENTIALS,
            oauth: {
              scopes: ['scope1'],
            },
          },
          false,
          EMPTY_CONFIG,
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
            EMPTY_CONFIG,
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

describe('connectToMcpServer with OAuth', () => {
  let mockedClient: ClientLib.Client;
  let workspaceContext: WorkspaceContext;
  let testWorkspace: string;
  let mockAuthProvider: MCPOAuthProvider;
  let mockTokenStorage: MCPOAuthTokenStorage;

  beforeEach(() => {
    mockedClient = {
      connect: vi.fn(),
      close: vi.fn(),
      registerCapabilities: vi.fn(),
      setRequestHandler: vi.fn(),
      onclose: vi.fn(),
      notification: vi.fn(),
    } as unknown as ClientLib.Client;
    vi.mocked(ClientLib.Client).mockImplementation(() => mockedClient);

    testWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-agent-test-'),
    );
    workspaceContext = new WorkspaceContext(testWorkspace);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockTokenStorage = {
      getCredentials: vi.fn().mockResolvedValue({ clientId: 'test-client' }),
    } as unknown as MCPOAuthTokenStorage;
    vi.mocked(MCPOAuthTokenStorage).mockReturnValue(mockTokenStorage);
    mockAuthProvider = {
      authenticate: vi.fn().mockResolvedValue(undefined),
      getValidToken: vi.fn().mockResolvedValue('test-access-token'),
      tokenStorage: mockTokenStorage,
    } as unknown as MCPOAuthProvider;
    vi.mocked(MCPOAuthProvider).mockReturnValue(mockAuthProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle automatic OAuth flow on 401 with www-authenticate header', async () => {
    const serverUrl = 'http://test-server.com/';
    const authUrl = 'http://auth.example.com/auth';
    const tokenUrl = 'http://auth.example.com/token';
    const wwwAuthHeader = `Bearer realm="test", resource_metadata="http://test-server.com/.well-known/oauth-protected-resource"`;

    vi.mocked(mockedClient.connect).mockRejectedValueOnce(
      new StreamableHTTPError(
        401,
        `Unauthorized\nwww-authenticate: ${wwwAuthHeader}`,
      ),
    );

    vi.mocked(OAuthUtils.discoverOAuthConfig).mockResolvedValue({
      authorizationUrl: authUrl,
      tokenUrl,
      scopes: ['test-scope'],
    });

    // We need this to be an any type because we dig into its private state.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedTransport: any;
    vi.mocked(mockedClient.connect).mockImplementationOnce(
      async (transport) => {
        capturedTransport = transport;
        return Promise.resolve();
      },
    );

    const client = await connectToMcpServer(
      'test-server',
      { httpUrl: serverUrl, oauth: { enabled: true } },
      false,
      workspaceContext,
      EMPTY_CONFIG,
    );

    expect(client).toBe(mockedClient);
    expect(mockedClient.connect).toHaveBeenCalledTimes(2);
    expect(mockAuthProvider.authenticate).toHaveBeenCalledOnce();

    const authHeader =
      capturedTransport._requestInit?.headers?.['Authorization'];
    expect(authHeader).toBe('Bearer test-access-token');
  });

  it('should discover oauth config if not in www-authenticate header', async () => {
    const serverUrl = 'http://test-server.com';
    const authUrl = 'http://auth.example.com/auth';
    const tokenUrl = 'http://auth.example.com/token';

    vi.mocked(mockedClient.connect).mockRejectedValueOnce(
      new StreamableHTTPError(401, 'Unauthorized'),
    );

    vi.mocked(OAuthUtils.discoverOAuthConfig).mockResolvedValue({
      authorizationUrl: authUrl,
      tokenUrl,
      scopes: ['test-scope'],
    });
    vi.mocked(mockAuthProvider.getValidToken).mockResolvedValue(
      'test-access-token-from-discovery',
    );

    // We need this to be an any type because we dig into its private state.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedTransport: any;
    vi.mocked(mockedClient.connect).mockImplementationOnce(
      async (transport) => {
        capturedTransport = transport;
        return Promise.resolve();
      },
    );

    const client = await connectToMcpServer(
      'test-server',
      { httpUrl: serverUrl, oauth: { enabled: true } },
      false,
      workspaceContext,
      EMPTY_CONFIG,
    );

    expect(client).toBe(mockedClient);
    expect(mockedClient.connect).toHaveBeenCalledTimes(2);
    expect(mockAuthProvider.authenticate).toHaveBeenCalledOnce();
    expect(OAuthUtils.discoverOAuthConfig).toHaveBeenCalledWith(serverUrl);

    const authHeader =
      capturedTransport._requestInit?.headers?.['Authorization'];
    expect(authHeader).toBe('Bearer test-access-token-from-discovery');
  });
});

describe('connectToMcpServer - HTTP→SSE fallback', () => {
  let mockedClient: ClientLib.Client;
  let workspaceContext: WorkspaceContext;
  let testWorkspace: string;

  beforeEach(() => {
    mockedClient = {
      connect: vi.fn(),
      close: vi.fn(),
      registerCapabilities: vi.fn(),
      setRequestHandler: vi.fn(),
      onclose: vi.fn(),
      notification: vi.fn(),
    } as unknown as ClientLib.Client;
    vi.mocked(ClientLib.Client).mockImplementation(() => mockedClient);

    testWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-agent-test-'),
    );
    workspaceContext = new WorkspaceContext(testWorkspace);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should NOT trigger fallback when type="http" is explicit', async () => {
    vi.mocked(mockedClient.connect).mockRejectedValueOnce(
      new Error('Connection failed'),
    );

    await expect(
      connectToMcpServer(
        'test-server',
        { url: 'http://test-server', type: 'http' },
        false,
        workspaceContext,
        EMPTY_CONFIG,
      ),
    ).rejects.toThrow('Connection failed');

    // Should only try once (no fallback)
    expect(mockedClient.connect).toHaveBeenCalledTimes(1);
  });

  it('should NOT trigger fallback when type="sse" is explicit', async () => {
    vi.mocked(mockedClient.connect).mockRejectedValueOnce(
      new Error('Connection failed'),
    );

    await expect(
      connectToMcpServer(
        'test-server',
        { url: 'http://test-server', type: 'sse' },
        false,
        workspaceContext,
        EMPTY_CONFIG,
      ),
    ).rejects.toThrow('Connection failed');

    // Should only try once (no fallback)
    expect(mockedClient.connect).toHaveBeenCalledTimes(1);
  });

  it('should trigger fallback when url provided without type and HTTP fails', async () => {
    vi.mocked(mockedClient.connect)
      .mockRejectedValueOnce(new StreamableHTTPError(500, 'Server error'))
      .mockResolvedValueOnce(undefined);

    const client = await connectToMcpServer(
      'test-server',
      { url: 'http://test-server' },
      false,
      workspaceContext,
      EMPTY_CONFIG,
    );

    expect(client).toBe(mockedClient);
    // First HTTP attempt fails, second SSE attempt succeeds
    expect(mockedClient.connect).toHaveBeenCalledTimes(2);
  });

  it('should throw original HTTP error when both HTTP and SSE fail (non-401)', async () => {
    const httpError = new StreamableHTTPError(500, 'Server error');
    const sseError = new Error('SSE connection failed');

    vi.mocked(mockedClient.connect)
      .mockRejectedValueOnce(httpError)
      .mockRejectedValueOnce(sseError);

    await expect(
      connectToMcpServer(
        'test-server',
        { url: 'http://test-server' },
        false,
        workspaceContext,
        EMPTY_CONFIG,
      ),
    ).rejects.toThrow('Server error');

    expect(mockedClient.connect).toHaveBeenCalledTimes(2);
  });

  it('should handle HTTP 404 followed by SSE success', async () => {
    vi.mocked(mockedClient.connect)
      .mockRejectedValueOnce(new StreamableHTTPError(404, 'Not Found'))
      .mockResolvedValueOnce(undefined);

    const client = await connectToMcpServer(
      'test-server',
      { url: 'http://test-server' },
      false,
      workspaceContext,
      EMPTY_CONFIG,
    );

    expect(client).toBe(mockedClient);
    expect(mockedClient.connect).toHaveBeenCalledTimes(2);
  });
});

describe('connectToMcpServer - OAuth with transport fallback', () => {
  let mockedClient: ClientLib.Client;
  let workspaceContext: WorkspaceContext;
  let testWorkspace: string;
  let mockAuthProvider: MCPOAuthProvider;
  let mockTokenStorage: MCPOAuthTokenStorage;

  beforeEach(() => {
    mockedClient = {
      connect: vi.fn(),
      close: vi.fn(),
      registerCapabilities: vi.fn(),
      setRequestHandler: vi.fn(),
      onclose: vi.fn(),
      notification: vi.fn(),
    } as unknown as ClientLib.Client;
    vi.mocked(ClientLib.Client).mockImplementation(() => mockedClient);

    testWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-agent-test-'),
    );
    workspaceContext = new WorkspaceContext(testWorkspace);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockTokenStorage = {
      getCredentials: vi.fn().mockResolvedValue({ clientId: 'test-client' }),
    } as unknown as MCPOAuthTokenStorage;
    vi.mocked(MCPOAuthTokenStorage).mockReturnValue(mockTokenStorage);

    mockAuthProvider = {
      authenticate: vi.fn().mockResolvedValue(undefined),
      getValidToken: vi.fn().mockResolvedValue('test-access-token'),
      tokenStorage: mockTokenStorage,
    } as unknown as MCPOAuthProvider;
    vi.mocked(MCPOAuthProvider).mockReturnValue(mockAuthProvider);

    vi.mocked(OAuthUtils.discoverOAuthConfig).mockResolvedValue({
      authorizationUrl: 'http://auth.example.com/auth',
      tokenUrl: 'http://auth.example.com/token',
      scopes: ['test-scope'],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle HTTP 404 → SSE 401 → OAuth → SSE+OAuth succeeds', async () => {
    // Tests that OAuth flow works when SSE (not HTTP) requires auth
    vi.mocked(mockedClient.connect)
      .mockRejectedValueOnce(new StreamableHTTPError(404, 'Not Found'))
      .mockRejectedValueOnce(new StreamableHTTPError(401, 'Unauthorized'))
      .mockResolvedValueOnce(undefined);

    const client = await connectToMcpServer(
      'test-server',
      { url: 'http://test-server', oauth: { enabled: true } },
      false,
      workspaceContext,
      EMPTY_CONFIG,
    );

    expect(client).toBe(mockedClient);
    expect(mockedClient.connect).toHaveBeenCalledTimes(3);
    expect(mockAuthProvider.authenticate).toHaveBeenCalledOnce();
  });
});
