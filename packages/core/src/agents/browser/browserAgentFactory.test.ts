/**
 * @license
 * Copyright 2026 Google LLC
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

import {
  buildBrowserSystemPrompt,
  BROWSER_AGENT_NAME,
} from './browserAgentDefinition.js';

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
          },
        },
        browser: {
          headless: false,
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

      expect(definition.name).toBe(BROWSER_AGENT_NAME);
      // 5 MCP tools + 1 type_text composite tool (no analyze_screenshot without visualModel)
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

    it('should exclude visual prompt section when visualModel is not configured', async () => {
      const { definition } = await createBrowserAgentDefinition(
        mockConfig,
        mockMessageBus,
      );

      const systemPrompt = definition.promptConfig?.systemPrompt ?? '';
      expect(systemPrompt).not.toContain('analyze_screenshot');
      expect(systemPrompt).not.toContain('VISUAL IDENTIFICATION');
    });

    it('should include visual prompt section when visualModel is configured', async () => {
      const configWithVision = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
            },
          },
          browser: {
            headless: false,
            visualModel: 'gemini-2.5-flash-preview',
          },
        },
      });

      const { definition } = await createBrowserAgentDefinition(
        configWithVision,
        mockMessageBus,
      );

      const systemPrompt = definition.promptConfig?.systemPrompt ?? '';
      expect(systemPrompt).toContain('analyze_screenshot');
      expect(systemPrompt).toContain('VISUAL IDENTIFICATION');
    });

    it('should include analyze_screenshot tool when visualModel is configured', async () => {
      const configWithVision = makeFakeConfig({
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
            },
          },
          browser: {
            headless: false,
            visualModel: 'gemini-2.5-flash-preview',
          },
        },
      });

      const { definition } = await createBrowserAgentDefinition(
        configWithVision,
        mockMessageBus,
      );

      // 5 MCP tools + 1 type_text + 1 analyze_screenshot
      expect(definition.toolConfig?.tools).toHaveLength(7);
      const toolNames =
        definition.toolConfig?.tools
          ?.filter(
            (t): t is { name: string } => typeof t === 'object' && 'name' in t,
          )
          .map((t) => t.name) ?? [];
      expect(toolNames).toContain('analyze_screenshot');
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

describe('buildBrowserSystemPrompt', () => {
  it('should include visual section when vision is enabled', () => {
    const prompt = buildBrowserSystemPrompt(true);
    expect(prompt).toContain('VISUAL IDENTIFICATION');
    expect(prompt).toContain('analyze_screenshot');
    expect(prompt).toContain('click_at');
  });

  it('should exclude visual section when vision is disabled', () => {
    const prompt = buildBrowserSystemPrompt(false);
    expect(prompt).not.toContain('VISUAL IDENTIFICATION');
    expect(prompt).not.toContain('analyze_screenshot');
  });

  it('should always include core sections regardless of vision', () => {
    for (const visionEnabled of [true, false]) {
      const prompt = buildBrowserSystemPrompt(visionEnabled);
      expect(prompt).toContain('PARALLEL TOOL CALLS');
      expect(prompt).toContain('OVERLAY/POPUP HANDLING');
      expect(prompt).toContain('COMPLEX WEB APPS');
      expect(prompt).toContain('TERMINAL FAILURES');
      expect(prompt).toContain('complete_task');
    }
  });
});
