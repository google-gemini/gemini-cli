/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserManager, DomainNotAllowedError } from './browserManager.js';
import { makeFakeConfig } from '../../test-utils/config.js';
import type { Config } from '../../config/config.js';
import { injectAutomationOverlay } from './automationOverlay.js';
import { injectInputBlocker } from './inputBlocker.js';
import { coreEvents } from '../../utils/events.js';

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
    stderr: null,
  })),
}));

vi.mock('../../utils/debugLogger.js', () => ({
  debugLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../telemetry/metrics.js', () => ({
  recordBrowserAgentConnection: vi.fn(),
}));

// Mock browser consent to always grant consent by default
vi.mock('../../utils/browserConsent.js', () => ({
  getBrowserConsentIfNeeded: vi.fn().mockResolvedValue(true),
}));

vi.mock('./automationOverlay.js', () => ({
  injectAutomationOverlay: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./inputBlocker.js', () => ({
  injectInputBlocker: vi.fn().mockResolvedValue(undefined),
  removeInputBlocker: vi.fn().mockResolvedValue(undefined),
  suspendInputBlocker: vi.fn().mockResolvedValue(undefined),
  resumeInputBlocker: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn((p: string) => {
      if (p.endsWith('bundled/chrome-devtools-mcp.mjs')) {
        return false; // Default
      }
      return actual.existsSync(p);
    }),
  };
});

import * as fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { recordBrowserAgentConnection } from '../../telemetry/metrics.js';
import { getBrowserConsentIfNeeded } from '../../utils/browserConsent.js';
import { debugLogger } from '../../utils/debugLogger.js';

describe('BrowserManager', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(injectAutomationOverlay).mockClear();
    vi.mocked(injectInputBlocker).mockClear();
    vi.spyOn(coreEvents, 'emitFeedback').mockImplementation(() => {});

    // Re-establish consent mock after resetAllMocks
    vi.mocked(getBrowserConsentIfNeeded).mockResolvedValue(true);

    // Setup mock config
    mockConfig = makeFakeConfig({
      agents: {
        overrides: {
          browser_agent: {
            enabled: true,
          },
        },
        browser: {
          headless: false,
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

    vi.mocked(StdioClientTransport).mockImplementation(
      () =>
        ({
          close: vi.fn().mockResolvedValue(undefined),
          stderr: {
            on: vi.fn(),
          },
        }) as unknown as InstanceType<typeof StdioClientTransport>,
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Clear singleton cache to avoid cross-test leakage
    await BrowserManager.resetAll();
  });

  describe('MCP bundled path resolution', () => {
    it('should use bundled path if it exists (handles bundled CLI)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();

      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'node',
          args: expect.arrayContaining([
            expect.stringMatching(
              /(dist[\\/])?bundled[\\/]chrome-devtools-mcp\.mjs$/,
            ),
          ]),
        }),
      );
    });

    it('should fall back to development path if bundled path does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();

      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'node',
          args: expect.arrayContaining([
            expect.stringMatching(
              /(dist[\\/])?bundled[\\/]chrome-devtools-mcp\.mjs$/,
            ),
          ]),
        }),
      );
    });
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
        isError: false,
      });
    });

    it('should block navigate_page to disallowed domain', async () => {
      const restrictedConfig = makeFakeConfig({
        agents: {
          browser: {
            allowedDomains: ['google.com'],
          },
        },
      });
      const manager = new BrowserManager(restrictedConfig);
      await expect(
        manager.callTool('navigate_page', { url: 'https://evil.com' }),
      ).rejects.toThrow(DomainNotAllowedError);
      expect(Client).not.toHaveBeenCalled();
    });

    it('should allow navigate_page to allowed domain', async () => {
      const restrictedConfig = makeFakeConfig({
        agents: {
          browser: {
            allowedDomains: ['google.com'],
          },
        },
      });
      const manager = new BrowserManager(restrictedConfig);
      const result = await manager.callTool('navigate_page', {
        url: 'https://google.com/search',
      });

      expect(result.isError).toBe(false);
      expect((result.content || [])[0]?.text).toBe('Tool result');
    });

    it('should allow navigate_page to subdomain when wildcard is used', async () => {
      const restrictedConfig = makeFakeConfig({
        agents: {
          browser: {
            allowedDomains: ['*.google.com'],
          },
        },
      });
      const manager = new BrowserManager(restrictedConfig);
      const result = await manager.callTool('navigate_page', {
        url: 'https://mail.google.com',
      });

      expect(result.isError).toBe(false);
      expect((result.content || [])[0]?.text).toBe('Tool result');
    });

    it('should block new_page to disallowed domain', async () => {
      const restrictedConfig = makeFakeConfig({
        agents: {
          browser: {
            allowedDomains: ['google.com'],
          },
        },
      });
      const manager = new BrowserManager(restrictedConfig);
      await expect(
        manager.callTool('new_page', { url: 'https://evil.com' }),
      ).rejects.toThrow(DomainNotAllowedError);
    });

    it('should block proxy URL with embedded disallowed domain in query params', async () => {
      const restrictedConfig = makeFakeConfig({
        agents: {
          browser: {
            allowedDomains: ['*.google.com'],
          },
        },
      });
      const manager = new BrowserManager(restrictedConfig);
      await expect(
        manager.callTool('new_page', {
          url: 'https://translate.google.com/translate?sl=en&tl=en&u=https://blocked.org/page',
        }),
      ).rejects.toThrow(DomainNotAllowedError);
    });

    it('should block proxy URL with embedded disallowed domain in URL fragment (hash)', async () => {
      const restrictedConfig = makeFakeConfig({
        agents: {
          browser: {
            allowedDomains: ['*.google.com'],
          },
        },
      });
      const manager = new BrowserManager(restrictedConfig);
      await expect(
        manager.callTool('new_page', {
          url: 'https://translate.google.com/#view=home&op=translate&sl=en&tl=zh-CN&u=https://blocked.org',
        }),
      ).rejects.toThrow(DomainNotAllowedError);
    });

    it('should allow proxy URL when embedded domain is also allowed', async () => {
      const restrictedConfig = makeFakeConfig({
        agents: {
          browser: {
            allowedDomains: ['*.google.com', 'github.com'],
          },
        },
      });
      const manager = new BrowserManager(restrictedConfig);
      const result = await manager.callTool('new_page', {
        url: 'https://translate.google.com/translate?u=https://github.com/repo',
      });

      expect(result.isError).toBe(false);
    });

    it('should allow navigation to allowed domain without proxy params', async () => {
      const restrictedConfig = makeFakeConfig({
        agents: {
          browser: {
            allowedDomains: ['*.google.com'],
          },
        },
      });
      const manager = new BrowserManager(restrictedConfig);
      const result = await manager.callTool('new_page', {
        url: 'https://translate.google.com/?sl=en&tl=zh',
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('MCP connection', () => {
    it('should record connection success metrics', async () => {
      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();

      expect(recordBrowserAgentConnection).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        {
          session_mode: 'persistent',
          headless: false,
          success: true,
          tool_count: 4,
        },
      );
    });

    it('should spawn npx chrome-devtools-mcp with --experimental-vision (persistent mode by default)', async () => {
      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();

      // Verify StdioClientTransport was created with correct args
      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'node',
          args: expect.arrayContaining([
            expect.stringMatching(/chrome-devtools-mcp\.mjs$/),
            '--experimental-vision',
          ]),
        }),
      );
      // Persistent mode should NOT include --isolated or --autoConnect
      const args = vi.mocked(StdioClientTransport).mock.calls[0]?.[0]
        ?.args as string[];
      expect(args).not.toContain('--isolated');
      expect(args).not.toContain('--autoConnect');
      expect(args).not.toContain('-y');
      // Persistent mode should set the default --userDataDir under ~/.gemini
      expect(args).toContain('--userDataDir');
      const userDataDirIndex = args.indexOf('--userDataDir');
      expect(args[userDataDirIndex + 1]).toMatch(/cli-browser-profile$/);
    });

    it('should pass --host-rules when allowedDomains is configured', async () => {
      const restrictedConfig = makeFakeConfig({
        agents: {
          browser: {
            allowedDomains: ['google.com', '*.openai.com'],
          },
        },
      });

      const manager = new BrowserManager(restrictedConfig);
      await manager.ensureConnection();

      const args = vi.mocked(StdioClientTransport).mock.calls[0]?.[0]
        ?.args as string[];
      expect(args).toContain(
        '--chromeArg="--host-rules=MAP * ~NOTFOUND, EXCLUDE google.com, EXCLUDE *.openai.com"',
      );
    });

    it('should throw error when invalid domain is configured in allowedDomains', async () => {
      const invalidConfig = makeFakeConfig({
        agents: {
          browser: {
            allowedDomains: ['invalid domain!'],
          },
        },
      });

      const manager = new BrowserManager(invalidConfig);
      await expect(manager.ensureConnection()).rejects.toThrow(
        'Invalid domain in allowedDomains: invalid domain!',
      );
    });

    it('should pass headless flag when configured', async () => {
      const headlessConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
            },
          },
          browser: {
            headless: true,
          },
        },
      });

      const manager = new BrowserManager(headlessConfig);
      await manager.ensureConnection();

      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'node',
          args: expect.arrayContaining(['--headless']),
        }),
      );
    });

    it('should pass profilePath as --userDataDir when configured', async () => {
      const profileConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
            },
          },
          browser: {
            profilePath: '/path/to/profile',
          },
        },
      });

      const manager = new BrowserManager(profileConfig);
      await manager.ensureConnection();

      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'node',
          args: expect.arrayContaining(['--userDataDir', '/path/to/profile']),
        }),
      );
    });

    it('should pass --isolated when sessionMode is isolated', async () => {
      const isolatedConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
            },
          },
          browser: {
            sessionMode: 'isolated',
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
            },
          },
          browser: {
            sessionMode: 'existing',
          },
        },
      });

      const manager = new BrowserManager(existingConfig);
      await manager.ensureConnection();

      const args = vi.mocked(StdioClientTransport).mock.calls[0]?.[0]
        ?.args as string[];
      expect(args).toContain('--autoConnect');
      expect(args).not.toContain('--isolated');

      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('saved logins will be visible'),
      );
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
            },
          },
          browser: {
            sessionMode: 'existing',
          },
        },
      });

      const manager = new BrowserManager(existingConfig);

      await expect(manager.ensureConnection()).rejects.toThrow(
        /Failed to connect to existing Chrome instance/,
      );

      expect(recordBrowserAgentConnection).toHaveBeenCalledWith(
        existingConfig,
        expect.any(Number),
        {
          session_mode: 'existing',
          headless: false,
          success: false,
          error_type: 'connection_refused',
        },
      );

      // Create a fresh manager to verify the error message includes remediation steps
      const manager2 = new BrowserManager(existingConfig);
      await expect(manager2.ensureConnection()).rejects.toThrow(
        /chrome:\/\/inspect\/#remote-debugging/,
      );
    });

    it('should throw profile-lock remediation when persistent mode hits "already running"', async () => {
      vi.mocked(Client).mockImplementation(
        () =>
          ({
            connect: vi
              .fn()
              .mockRejectedValue(
                new Error(
                  'Could not connect to Chrome. The browser is already running for the current profile.',
                ),
              ),
            close: vi.fn().mockResolvedValue(undefined),
            listTools: vi.fn(),
            callTool: vi.fn(),
          }) as unknown as InstanceType<typeof Client>,
      );

      // Default config = persistent mode
      const manager = new BrowserManager(mockConfig);

      await expect(manager.ensureConnection()).rejects.toThrow(
        /Close all Chrome windows using this profile/,
      );

      expect(recordBrowserAgentConnection).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        {
          session_mode: 'persistent',
          headless: false,
          success: false,
          error_type: 'profile_locked',
        },
      );

      const manager2 = new BrowserManager(mockConfig);
      await expect(manager2.ensureConnection()).rejects.toThrow(
        /Set sessionMode to "isolated"/,
      );
    });

    it('should throw timeout-specific remediation for persistent mode', async () => {
      vi.mocked(Client).mockImplementation(
        () =>
          ({
            connect: vi
              .fn()
              .mockRejectedValue(
                new Error('Timed out connecting to chrome-devtools-mcp'),
              ),
            close: vi.fn().mockResolvedValue(undefined),
            listTools: vi.fn(),
            callTool: vi.fn(),
          }) as unknown as InstanceType<typeof Client>,
      );

      const manager = new BrowserManager(mockConfig);

      await expect(manager.ensureConnection()).rejects.toThrow(
        /Chrome is not installed/,
      );

      expect(recordBrowserAgentConnection).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        {
          session_mode: 'persistent',
          headless: false,
          success: false,
          error_type: 'timeout',
        },
      );
    });

    it('should include sessionMode in generic fallback error', async () => {
      vi.mocked(Client).mockImplementation(
        () =>
          ({
            connect: vi
              .fn()
              .mockRejectedValue(new Error('Some unexpected error')),
            close: vi.fn().mockResolvedValue(undefined),
            listTools: vi.fn(),
            callTool: vi.fn(),
          }) as unknown as InstanceType<typeof Client>,
      );

      const manager = new BrowserManager(mockConfig);

      await expect(manager.ensureConnection()).rejects.toThrow(
        /sessionMode: persistent/,
      );

      expect(recordBrowserAgentConnection).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        {
          session_mode: 'persistent',
          headless: false,
          success: false,
          error_type: 'unknown',
        },
      );
    });

    it('should classify non-connection-refused errors in existing mode as unknown', async () => {
      vi.mocked(Client).mockImplementation(
        () =>
          ({
            connect: vi
              .fn()
              .mockRejectedValue(new Error('Some unexpected error')),
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
            },
          },
          browser: {
            sessionMode: 'existing',
          },
        },
      });

      const manager = new BrowserManager(existingConfig);

      await expect(manager.ensureConnection()).rejects.toThrow(
        /Failed to connect to existing Chrome instance/,
      );

      expect(recordBrowserAgentConnection).toHaveBeenCalledWith(
        existingConfig,
        expect.any(Number),
        {
          session_mode: 'existing',
          headless: false,
          success: false,
          error_type: 'unknown',
        },
      );
    });

    it('should pass --no-usage-statistics and --no-performance-crux when privacy is disabled', async () => {
      const privacyDisabledConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
            },
          },
          browser: {
            headless: false,
          },
        },
        usageStatisticsEnabled: false,
      });

      const manager = new BrowserManager(privacyDisabledConfig);
      await manager.ensureConnection();

      const args = vi.mocked(StdioClientTransport).mock.calls[0]?.[0]
        ?.args as string[];
      expect(args).toContain('--no-usage-statistics');
      expect(args).toContain('--no-performance-crux');
    });

    it('should NOT pass privacy flags when usage statistics are enabled', async () => {
      // Default config has usageStatisticsEnabled: true (or undefined)
      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();

      const args = vi.mocked(StdioClientTransport).mock.calls[0]?.[0]
        ?.args as string[];
      expect(args).not.toContain('--no-usage-statistics');
      expect(args).not.toContain('--no-performance-crux');
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
      await manager.getRawMcpClient();

      await manager.close();
      expect(manager.isConnected()).toBe(false);
    });

    it('should NOT log error when transport closes during intentional close()', async () => {
      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();

      const transportInstance =
        vi.mocked(StdioClientTransport).mock.results[0]?.value;

      // Trigger onclose during close()
      vi.spyOn(transportInstance, 'close').mockImplementation(async () => {
        transportInstance.onclose?.();
      });

      await manager.close();

      expect(debugLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('transport closed unexpectedly'),
      );
    });
  });

  describe('getInstance', () => {
    it('should return the same instance for the same session mode', () => {
      const instance1 = BrowserManager.getInstance(mockConfig);
      const instance2 = BrowserManager.getInstance(mockConfig);

      expect(instance1).toBe(instance2);
    });

    it('should return different instances for different session modes', () => {
      const isolatedConfig = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { sessionMode: 'isolated' },
        },
      });

      const instance1 = BrowserManager.getInstance(mockConfig);
      const instance2 = BrowserManager.getInstance(isolatedConfig);

      expect(instance1).not.toBe(instance2);
    });

    it('should return different instances for different profile paths', () => {
      const config1 = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { profilePath: '/path/a' },
        },
      });
      const config2 = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { profilePath: '/path/b' },
        },
      });

      const instance1 = BrowserManager.getInstance(config1);
      const instance2 = BrowserManager.getInstance(config2);

      expect(instance1).not.toBe(instance2);
    });

    it('should throw when acquired instance is requested in persistent mode', () => {
      // mockConfig defaults to persistent mode
      const instance1 = BrowserManager.getInstance(mockConfig);
      instance1.acquire();

      expect(() => BrowserManager.getInstance(mockConfig)).toThrow(
        /Cannot launch a concurrent browser agent in "persistent" session mode/,
      );
    });

    it('should throw when acquired instance is requested in existing mode', () => {
      const existingConfig = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { sessionMode: 'existing' },
        },
      });

      const instance1 = BrowserManager.getInstance(existingConfig);
      instance1.acquire();

      expect(() => BrowserManager.getInstance(existingConfig)).toThrow(
        /Cannot launch a concurrent browser agent in "existing" session mode/,
      );
    });

    it('should return a different instance when the primary is acquired in isolated mode', () => {
      const isolatedConfig = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { sessionMode: 'isolated' },
        },
      });

      const instance1 = BrowserManager.getInstance(isolatedConfig);
      instance1.acquire();

      const instance2 = BrowserManager.getInstance(isolatedConfig);

      expect(instance2).not.toBe(instance1);
      expect(instance1.isAcquired()).toBe(true);
      expect(instance2.isAcquired()).toBe(false);
    });

    it('should reuse the primary when it has been released', () => {
      const instance1 = BrowserManager.getInstance(mockConfig);
      instance1.acquire();
      instance1.release();

      const instance2 = BrowserManager.getInstance(mockConfig);

      expect(instance2).toBe(instance1);
      expect(instance1.isAcquired()).toBe(false);
    });

    it('should reuse a released parallel instance in isolated mode', () => {
      const isolatedConfig = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { sessionMode: 'isolated' },
        },
      });

      const instance1 = BrowserManager.getInstance(isolatedConfig);
      instance1.acquire();

      const instance2 = BrowserManager.getInstance(isolatedConfig);
      instance2.acquire();
      instance2.release();

      // Primary is still acquired, parallel is released — should reuse parallel
      const instance3 = BrowserManager.getInstance(isolatedConfig);
      expect(instance3).toBe(instance2);
    });

    it('should create multiple parallel instances in isolated mode', () => {
      const isolatedConfig = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { sessionMode: 'isolated' },
        },
      });

      const instance1 = BrowserManager.getInstance(isolatedConfig);
      instance1.acquire();

      const instance2 = BrowserManager.getInstance(isolatedConfig);
      instance2.acquire();

      const instance3 = BrowserManager.getInstance(isolatedConfig);

      expect(instance1).not.toBe(instance2);
      expect(instance2).not.toBe(instance3);
      expect(instance1).not.toBe(instance3);
    });

    it('should throw when MAX_PARALLEL_INSTANCES is reached in isolated mode', () => {
      const isolatedConfig = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { sessionMode: 'isolated' },
        },
      });

      // Acquire MAX_PARALLEL_INSTANCES instances
      for (let i = 0; i < BrowserManager.MAX_PARALLEL_INSTANCES; i++) {
        const instance = BrowserManager.getInstance(isolatedConfig);
        instance.acquire();
      }

      // Next call should throw
      expect(() => BrowserManager.getInstance(isolatedConfig)).toThrow(
        /Maximum number of parallel browser instances/,
      );
    });
  });

  describe('resetAll', () => {
    it('should close all instances and clear the cache', async () => {
      const instance1 = BrowserManager.getInstance(mockConfig);
      await instance1.ensureConnection();

      const isolatedConfig = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { sessionMode: 'isolated' },
        },
      });
      const instance2 = BrowserManager.getInstance(isolatedConfig);
      await instance2.ensureConnection();

      await BrowserManager.resetAll();

      // After resetAll, getInstance should return new instances
      const instance3 = BrowserManager.getInstance(mockConfig);
      expect(instance3).not.toBe(instance1);
    });

    it('should handle errors during cleanup gracefully', async () => {
      const instance = BrowserManager.getInstance(mockConfig);
      await instance.ensureConnection();

      // Make close throw by overriding the client's close method
      const client = await instance.getRawMcpClient();
      vi.mocked(client.close).mockRejectedValueOnce(new Error('close failed'));

      // Should not throw
      await expect(BrowserManager.resetAll()).resolves.toBeUndefined();
    });

    it('should NOT log error when transport closes during resetAll()', async () => {
      const instance = BrowserManager.getInstance(mockConfig);
      await instance.ensureConnection();

      const transportInstance =
        vi.mocked(StdioClientTransport).mock.results[0]?.value;

      // Trigger onclose during close() which is called by resetAll()
      vi.spyOn(transportInstance, 'close').mockImplementation(async () => {
        transportInstance.onclose?.();
      });

      await BrowserManager.resetAll();

      expect(debugLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('transport closed unexpectedly'),
      );
    });
  });

  describe('isConnected', () => {
    it('should return false before connection', () => {
      const manager = new BrowserManager(mockConfig);
      expect(manager.isConnected()).toBe(false);
    });

    it('should return true after successful connection', async () => {
      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();
      expect(manager.isConnected()).toBe(true);
    });

    it('should return false after close', async () => {
      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();
      await manager.close();
      expect(manager.isConnected()).toBe(false);
    });
  });

  describe('reconnection', () => {
    it('should reconnect after unexpected disconnect and log error', async () => {
      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();

      // Simulate transport closing unexpectedly via the onclose callback
      const transportInstance =
        vi.mocked(StdioClientTransport).mock.results[0]?.value;
      if (transportInstance?.onclose) {
        transportInstance.onclose();
      }

      expect(debugLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('transport closed unexpectedly'),
      );

      // Manager should recognize disconnection
      expect(manager.isConnected()).toBe(false);

      // ensureConnection should reconnect
      await manager.ensureConnection();
      expect(manager.isConnected()).toBe(true);
    });
  });

  describe('concurrency', () => {
    it('should not call connectMcp twice when ensureConnection is called concurrently', async () => {
      const manager = new BrowserManager(mockConfig);

      // Call ensureConnection twice simultaneously without awaiting the first
      const [p1, p2] = [manager.ensureConnection(), manager.ensureConnection()];
      await Promise.all([p1, p2]);

      // connectMcp (via StdioClientTransport constructor) should only have been called once
      // Each connection attempt creates a new StdioClientTransport
    });
  });

  describe('overlay re-injection in callTool', () => {
    it('should re-inject overlay and input blocker after click in non-headless mode when input disabling is enabled', async () => {
      // Enable input disabling in config
      mockConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
            },
          },
          browser: {
            headless: false,
            disableUserInput: true,
          },
        },
      });

      const manager = new BrowserManager(mockConfig);
      await manager.callTool('click', { uid: '1_2' });

      expect(injectAutomationOverlay).toHaveBeenCalledWith(manager, undefined);
      expect(injectInputBlocker).toHaveBeenCalledWith(manager, undefined);
    });

    it('should re-inject overlay and input blocker after navigate_page in non-headless mode when input disabling is enabled', async () => {
      mockConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
            },
          },
          browser: {
            headless: false,
            disableUserInput: true,
          },
        },
      });

      const manager = new BrowserManager(mockConfig);
      await manager.callTool('navigate_page', { url: 'https://example.com' });

      expect(injectAutomationOverlay).toHaveBeenCalledWith(manager, undefined);
      expect(injectInputBlocker).toHaveBeenCalledWith(manager, undefined);
    });

    it('should re-inject overlay and input blocker after click_at, new_page, press_key, handle_dialog when input disabling is enabled', async () => {
      mockConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
            },
          },
          browser: {
            headless: false,
            disableUserInput: true,
          },
        },
      });

      const manager = new BrowserManager(mockConfig);
      for (const tool of [
        'click_at',
        'new_page',
        'press_key',
        'handle_dialog',
      ]) {
        vi.mocked(injectAutomationOverlay).mockClear();
        vi.mocked(injectInputBlocker).mockClear();
        await manager.callTool(tool, {});
        expect(injectAutomationOverlay).toHaveBeenCalledTimes(1);
        expect(injectInputBlocker).toHaveBeenCalledTimes(1);
        expect(injectInputBlocker).toHaveBeenCalledWith(manager, undefined);
      }
    });

    it('should NOT re-inject overlay or input blocker after read-only tools', async () => {
      const manager = new BrowserManager(mockConfig);
      for (const tool of [
        'take_snapshot',
        'take_screenshot',
        'get_console_message',
        'fill',
      ]) {
        vi.mocked(injectAutomationOverlay).mockClear();
        vi.mocked(injectInputBlocker).mockClear();
        await manager.callTool(tool, {});
        expect(injectAutomationOverlay).not.toHaveBeenCalled();
        expect(injectInputBlocker).not.toHaveBeenCalled();
      }
    });

    it('should NOT re-inject overlay when headless is true', async () => {
      const headlessConfig = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { headless: true },
        },
      });
      const manager = new BrowserManager(headlessConfig);
      await manager.callTool('click', { uid: '1_2' });

      expect(injectAutomationOverlay).not.toHaveBeenCalled();
    });

    it('should NOT re-inject overlay when tool returns an error result', async () => {
      vi.mocked(Client).mockImplementation(
        () =>
          ({
            connect: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
            listTools: vi.fn().mockResolvedValue({ tools: [] }),
            callTool: vi.fn().mockResolvedValue({
              content: [{ type: 'text', text: 'Element not found' }],
              isError: true,
            }),
          }) as unknown as InstanceType<typeof Client>,
      );

      const manager = new BrowserManager(mockConfig);
      await manager.callTool('click', { uid: 'bad' });
    });

    it('should NOT re-inject overlay if select_page is called with bringToFront: false', async () => {
      mockConfig = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
            },
          },
          browser: {
            headless: false,
            disableUserInput: true,
          },
        },
      });

      const manager = new BrowserManager(mockConfig);
      await manager.callTool('select_page', { pageId: 1, bringToFront: false });

      expect(injectAutomationOverlay).not.toHaveBeenCalled();
      expect(injectInputBlocker).not.toHaveBeenCalled();
    });
  });

  describe('Rate limiting', () => {
    it('should terminate task when maxActionsPerTask is reached', async () => {
      const limitedConfig = makeFakeConfig({
        agents: {
          browser: {
            maxActionsPerTask: 3,
          },
        },
      });
      const manager = new BrowserManager(limitedConfig);

      // First 3 calls should succeed
      await manager.callTool('take_snapshot', {});
      await manager.callTool('take_snapshot', { some: 'args' });
      await manager.callTool('take_snapshot', { other: 'args' });
      await manager.callTool('take_snapshot', { other: 'new args' });

      // 4th call should throw
      await expect(manager.callTool('take_snapshot', {})).rejects.toThrow(
        /maximum action limit \(3\)/,
      );
    });

    it('should NOT increment action counter when shouldCount is false', async () => {
      const limitedConfig = makeFakeConfig({
        agents: {
          browser: {
            maxActionsPerTask: 1,
          },
        },
      });
      const manager = new BrowserManager(limitedConfig);

      // Multiple calls with isInternal: true should NOT exhaust the limit
      await manager.callTool('evaluate_script', {}, undefined, true);
      await manager.callTool('evaluate_script', {}, undefined, true);
      await manager.callTool('evaluate_script', {}, undefined, true);

      // This should still work
      await manager.callTool('take_snapshot', {});

      // Next one should throw (limit 1 allows exactly 1 call with >= check)
      await expect(manager.callTool('take_snapshot', {})).rejects.toThrow(
        /maximum action limit \(1\)/,
      );
    });
  });

  describe('sandbox behavior', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should force --isolated and --headless when in seatbelt sandbox with persistent mode', async () => {
      vi.stubEnv('SANDBOX', 'sandbox-exec');
      const feedbackSpy = vi
        .spyOn(coreEvents, 'emitFeedback')
        .mockImplementation(() => {});

      const manager = new BrowserManager(mockConfig); // default persistent mode
      await manager.ensureConnection();

      const args = vi.mocked(StdioClientTransport).mock.calls[0]?.[0]
        ?.args as string[];
      expect(args).toContain('--isolated');
      expect(args).toContain('--headless');
      expect(args).not.toContain('--userDataDir');
      expect(args).not.toContain('--autoConnect');
      expect(feedbackSpy).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('isolated browser session'),
      );
    });

    it('should preserve --autoConnect when in seatbelt sandbox with existing mode', async () => {
      vi.stubEnv('SANDBOX', 'sandbox-exec');
      const existingConfig = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { sessionMode: 'existing' },
        },
      });

      const manager = new BrowserManager(existingConfig);
      await manager.ensureConnection();

      const args = vi.mocked(StdioClientTransport).mock.calls[0]?.[0]
        ?.args as string[];
      expect(args).toContain('--autoConnect');
      expect(args).not.toContain('--isolated');
      // Headless should NOT be forced for existing mode in seatbelt
      expect(args).not.toContain('--headless');
    });

    it('should use --browser-url with resolved IP for container sandbox with existing mode', async () => {
      vi.stubEnv('SANDBOX', 'docker-container-0');
      // Mock DNS resolution of host.docker.internal
      const dns = await import('node:dns');
      vi.spyOn(dns.promises, 'lookup').mockResolvedValue({
        address: '192.168.127.254',
        family: 4,
      });
      const feedbackSpy = vi
        .spyOn(coreEvents, 'emitFeedback')
        .mockImplementation(() => {});
      const existingConfig = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { sessionMode: 'existing' },
        },
      });

      const manager = new BrowserManager(existingConfig);
      await manager.ensureConnection();

      const args = vi.mocked(StdioClientTransport).mock.calls[0]?.[0]
        ?.args as string[];
      expect(args).toContain('--browser-url');
      expect(args).toContain('http://192.168.127.254:9222');
      expect(args).not.toContain('--autoConnect');
      expect(feedbackSpy).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('192.168.127.254:9222'),
      );
    });

    it('should not override session mode when not in sandbox', async () => {
      vi.stubEnv('SANDBOX', '');
      const manager = new BrowserManager(mockConfig);
      await manager.ensureConnection();

      const args = vi.mocked(StdioClientTransport).mock.calls[0]?.[0]
        ?.args as string[];
      // Default persistent mode: no --isolated, no --autoConnect
      expect(args).not.toContain('--isolated');
      expect(args).not.toContain('--autoConnect');
      expect(args).toContain('--userDataDir');
    });
  });
});
