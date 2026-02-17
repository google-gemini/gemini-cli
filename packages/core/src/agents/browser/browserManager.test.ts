/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserManager } from './browserManager.js';
import { makeFakeConfig } from '../../test-utils/config.js';
import type { Config } from '../../config/config.js';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        { name: 'take_snapshot', description: 'Take a snapshot' },
        { name: 'click', description: 'Click an element' },
        { name: 'click_at', description: 'Click at coordinates' },
        { name: 'take_screenshot', description: 'Take a screenshot' },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Tool result' }],
    }),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../utils/debugLogger.js', () => ({
  debugLogger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('BrowserManager', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup mock config
    mockConfig = makeFakeConfig({
      agents: {
        overrides: {
          browser_agent: {
            enabled: true,
            customConfig: {
              headless: false,
            },
          },
        },
      },
    });

    // Re-setup Client mock after reset
    vi.mocked(Client).mockImplementation(
      () =>
        ({
          connect: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
          listTools: vi.fn().mockResolvedValue({
            tools: [
              { name: 'take_snapshot', description: 'Take a snapshot' },
              { name: 'click', description: 'Click an element' },
              { name: 'click_at', description: 'Click at coordinates' },
              { name: 'take_screenshot', description: 'Take a screenshot' },
            ],
          }),
          callTool: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Tool result' }],
          }),
        }) as unknown as InstanceType<typeof Client>,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getRawMcpClient', () => {
    it('should ensure connection and return raw MCP client', async () => {
      const manager = new BrowserManager(mockConfig);
      const client = await manager.getRawMcpClient();

      expect(client).toBeDefined();
      expect(Client).toHaveBeenCalled();
    });

    it('should return cached client if already connected', async () => {
      const manager = new BrowserManager(mockConfig);

      // First call
      const client1 = await manager.getRawMcpClient();

      // Second call should use cache
      const client2 = await manager.getRawMcpClient();

      expect(client1).toBe(client2);
      // Client constructor should only be called once
      expect(Client).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDiscoveredTools', () => {
    it('should return tools discovered from MCP server including visual tools', async () => {
      const manager = new BrowserManager(mockConfig);
      const tools = await manager.getDiscoveredTools();

      expect(tools).toHaveLength(4);
      expect(tools.map((t) => t.name)).toContain('take_snapshot');
      expect(tools.map((t) => t.name)).toContain('click');
      expect(tools.map((t) => t.name)).toContain('click_at');
      expect(tools.map((t) => t.name)).toContain('take_screenshot');
    });
  });

  describe('callTool', () => {
    it('should call tool on MCP client and return result', async () => {
      const manager = new BrowserManager(mockConfig);
      const result = await manager.callTool('take_snapshot', { verbose: true });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Tool result' }],
      });
    });
  });

  describe('MCP connection', () => {
    it('should spawn npx chrome-devtools-mcp with --experimental-vision (persistent mode by default)', async () => {
      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();

      // Verify StdioClientTransport was created with correct args
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'npx',
        args: expect.arrayContaining([
          '-y',
          expect.stringMatching(/chrome-devtools-mcp@/),
          '--experimental-vision',
        ]),
      });
      // Persistent mode should NOT include --isolated or --autoConnect
      const args = vi.mocked(StdioClientTransport).mock.calls[0]?.[0]
        ?.args as string[];
      expect(args).not.toContain('--isolated');
      expect(args).not.toContain('--autoConnect');
    });

    it('should pass headless flag when configured', async () => {
      const headlessConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
              customConfig: {
                headless: true,
              },
            },
          },
        },
      });

      const manager = new BrowserManager(headlessConfig);
      await manager.ensureConnection();

      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'npx',
        args: expect.arrayContaining(['--headless']),
      });
    });

    it('should pass chromeProfilePath as --userDataDir when configured', async () => {
      const profileConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
              customConfig: {
                chromeProfilePath: '/path/to/profile',
              },
            },
          },
        },
      });

      const manager = new BrowserManager(profileConfig);
      await manager.ensureConnection();

      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'npx',
        args: expect.arrayContaining(['--userDataDir', '/path/to/profile']),
      });
    });

    it('should pass --isolated when sessionMode is isolated', async () => {
      const isolatedConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
              customConfig: {
                sessionMode: 'isolated',
              },
            },
          },
        },
      });

      const manager = new BrowserManager(isolatedConfig);
      await manager.ensureConnection();

      const args = vi.mocked(StdioClientTransport).mock.calls[0]?.[0]
        ?.args as string[];
      expect(args).toContain('--isolated');
      expect(args).not.toContain('--autoConnect');
    });

    it('should pass --autoConnect when sessionMode is existing', async () => {
      const existingConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
              customConfig: {
                sessionMode: 'existing',
              },
            },
          },
        },
      });

      const manager = new BrowserManager(existingConfig);
      await manager.ensureConnection();

      const args = vi.mocked(StdioClientTransport).mock.calls[0]?.[0]
        ?.args as string[];
      expect(args).toContain('--autoConnect');
      expect(args).not.toContain('--isolated');
    });

    it('should throw actionable error when existing mode connection fails', async () => {
      // Make the Client mock's connect method reject
      vi.mocked(Client).mockImplementation(
        () =>
          ({
            connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
            close: vi.fn().mockResolvedValue(undefined),
            listTools: vi.fn(),
            callTool: vi.fn(),
          }) as unknown as InstanceType<typeof Client>,
      );

      const existingConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
              customConfig: {
                sessionMode: 'existing',
              },
            },
          },
        },
      });

      const manager = new BrowserManager(existingConfig);

      await expect(manager.ensureConnection()).rejects.toThrow(
        /Failed to connect to existing Chrome instance/,
      );
      await expect(manager.ensureConnection()).rejects.toThrow(
        /chrome:\/\/inspect\/#remote-debugging/,
      );
    });
  });

  describe('MCP isolation', () => {
    it('should use raw MCP SDK Client, not McpClient wrapper', async () => {
      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();

      // Verify we're using the raw Client from MCP SDK
      expect(Client).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'gemini-cli-browser-agent',
        }),
        expect.any(Object),
      );
    });

    it('should not use McpClientManager from config', async () => {
      // Spy on config method to verify isolation
      const getMcpClientManagerSpy = vi.spyOn(
        mockConfig,
        'getMcpClientManager',
      );

      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();

      // Config's getMcpClientManager should NOT be called
      // This ensures isolation from main registry
      expect(getMcpClientManagerSpy).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close MCP connections', async () => {
      const manager = new BrowserManager(mockConfig);
      const client = await manager.getRawMcpClient();

      await manager.close();

      expect(client.close).toHaveBeenCalled();
    });
  });
});
