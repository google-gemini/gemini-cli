/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createBrowserAgentDefinition,
  cleanupBrowserAgent,
} from './browserAgentFactory.js';
import { makeFakeConfig } from '../../test-utils/config.js';
import type { Config } from '../../config/config.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { BrowserManager } from './browserManager.js';

// Create mock browser manager
const mockBrowserManager = {
  ensureConnection: vi.fn().mockResolvedValue(undefined),
  getDiscoveredTools: vi.fn().mockResolvedValue([
    // Semantic tools
    { name: 'take_snapshot', description: 'Take snapshot' },
    { name: 'click', description: 'Click element' },
    { name: 'fill', description: 'Fill form field' },
    { name: 'navigate_page', description: 'Navigate to URL' },
    // Visual tools (from --experimental-vision)
    { name: 'click_at', description: 'Click at coordinates' },
  ]),
  callTool: vi.fn().mockResolvedValue({ content: [] }),
  close: vi.fn().mockResolvedValue(undefined),
};

// Mock dependencies
vi.mock('./browserManager.js', () => ({
  BrowserManager: vi.fn(() => mockBrowserManager),
}));

vi.mock('../../utils/debugLogger.js', () => ({
  debugLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('browserAgentFactory', () => {
  let mockConfig: Config;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockBrowserManager.ensureConnection.mockResolvedValue(undefined);
    mockBrowserManager.getDiscoveredTools.mockResolvedValue([
      // Semantic tools
      { name: 'take_snapshot', description: 'Take snapshot' },
      { name: 'click', description: 'Click element' },
      { name: 'fill', description: 'Fill form field' },
      { name: 'navigate_page', description: 'Navigate to URL' },
      // Visual tools (from --experimental-vision)
      { name: 'click_at', description: 'Click at coordinates' },
    ]);
    mockBrowserManager.close.mockResolvedValue(undefined);

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

    mockMessageBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createBrowserAgentDefinition', () => {
    it('should ensure browser connection', async () => {
      await createBrowserAgentDefinition(mockConfig, mockMessageBus);

      expect(mockBrowserManager.ensureConnection).toHaveBeenCalled();
    });

    it('should return agent definition with discovered tools', async () => {
      const { definition } = await createBrowserAgentDefinition(
        mockConfig,
        mockMessageBus,
      );

      expect(definition.name).toBe('browser_agent');
      // 5 MCP tools + 1 analyze_screenshot tool
      expect(definition.toolConfig?.tools).toHaveLength(6);
    });

    it('should return browser manager for cleanup', async () => {
      const { browserManager } = await createBrowserAgentDefinition(
        mockConfig,
        mockMessageBus,
      );

      expect(browserManager).toBeDefined();
    });

    it('should call printOutput when provided', async () => {
      const printOutput = vi.fn();

      await createBrowserAgentDefinition(
        mockConfig,
        mockMessageBus,
        printOutput,
      );

      expect(printOutput).toHaveBeenCalled();
    });

    it('should create definition with correct structure', async () => {
      const { definition } = await createBrowserAgentDefinition(
        mockConfig,
        mockMessageBus,
      );

      expect(definition.kind).toBe('local');
      expect(definition.inputConfig).toBeDefined();
      expect(definition.outputConfig).toBeDefined();
      expect(definition.promptConfig).toBeDefined();
    });
  });

  describe('cleanupBrowserAgent', () => {
    it('should call close on browser manager', async () => {
      await cleanupBrowserAgent(
        mockBrowserManager as unknown as BrowserManager,
      );

      expect(mockBrowserManager.close).toHaveBeenCalled();
    });

    it('should handle errors during cleanup gracefully', async () => {
      const errorManager = {
        close: vi.fn().mockRejectedValue(new Error('Close failed')),
      } as unknown as BrowserManager;

      // Should not throw
      await expect(cleanupBrowserAgent(errorManager)).resolves.toBeUndefined();
    });
  });
});
