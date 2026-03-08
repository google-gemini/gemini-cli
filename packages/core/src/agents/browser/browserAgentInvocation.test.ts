/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserAgentInvocation } from './browserAgentInvocation.js';
import { makeFakeConfig } from '../../test-utils/config.js';
import type { Config } from '../../config/config.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { AgentInputs } from '../types.js';

// Mock dependencies before imports
vi.mock('../../utils/debugLogger.js', () => ({
  debugLogger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

const mockRecordBrowserTaskOutcome = vi.fn();
const mockRecordBrowserTaskDuration = vi.fn();

vi.mock('../../telemetry/metrics.js', () => ({
  recordBrowserTaskOutcome: (...args: unknown[]) =>
    mockRecordBrowserTaskOutcome(...args),
  recordBrowserTaskDuration: (...args: unknown[]) =>
    mockRecordBrowserTaskDuration(...args),
}));

const mockBrowserManager = {
  close: vi.fn().mockResolvedValue(undefined),
  getSessionMode: vi.fn().mockReturnValue('isolated'),
  isHeadless: vi.fn().mockReturnValue(false),
};

const mockCleanupBrowserAgent = vi.fn().mockResolvedValue(undefined);
const mockCreateBrowserAgentDefinition = vi.fn().mockResolvedValue({
  definition: {
    name: 'browser_agent',
    kind: 'local',
    toolConfig: {
      tools: [{ name: 'click' }, { name: 'take_snapshot' }],
    },
  },
  browserManager: mockBrowserManager,
});

vi.mock('./browserAgentFactory.js', () => ({
  createBrowserAgentDefinition: (...args: unknown[]) =>
    mockCreateBrowserAgentDefinition(...args),
  cleanupBrowserAgent: (...args: unknown[]) => mockCleanupBrowserAgent(...args),
}));

const mockExecutorRun = vi.fn().mockResolvedValue({
  result: JSON.stringify({ success: true, summary: 'Done' }),
  terminate_reason: 'GOAL',
});

vi.mock('../local-executor.js', () => ({
  LocalAgentExecutor: {
    create: vi.fn().mockResolvedValue({
      run: (...args: unknown[]) => mockExecutorRun(...args),
    }),
  },
}));

import { LocalAgentExecutor } from '../local-executor.js';

describe('BrowserAgentInvocation', () => {
  let mockConfig: Config;
  let mockMessageBus: MessageBus;
  let mockParams: AgentInputs;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordBrowserTaskOutcome.mockClear();
    mockRecordBrowserTaskDuration.mockClear();

    // Re-establish LocalAgentExecutor.create after vi.clearAllMocks()
    vi.mocked(LocalAgentExecutor.create).mockResolvedValue({
      run: (...args: unknown[]) => mockExecutorRun(...args),
    } as Awaited<ReturnType<typeof LocalAgentExecutor.create>>);

    mockConfig = makeFakeConfig({
      agents: {
        overrides: {
          browser_agent: {
            enabled: true,
          },
        },
        browser: {
          headless: false,
          sessionMode: 'isolated',
        },
      },
    });

    mockMessageBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;

    mockParams = {
      task: 'Navigate to example.com and click the button',
    };

    // Reset mocks to default happy-path behavior
    mockBrowserManager.close.mockResolvedValue(undefined);
    mockBrowserManager.getSessionMode.mockReturnValue('isolated');
    mockBrowserManager.isHeadless.mockReturnValue(false);
    mockCleanupBrowserAgent.mockResolvedValue(undefined);
    mockCreateBrowserAgentDefinition.mockResolvedValue({
      definition: {
        name: 'browser_agent',
        kind: 'local',
        toolConfig: {
          tools: [{ name: 'click' }, { name: 'take_snapshot' }],
        },
      },
      browserManager: mockBrowserManager,
    });
    mockExecutorRun.mockResolvedValue({
      result: JSON.stringify({ success: true, summary: 'Done' }),
      terminate_reason: 'GOAL',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create invocation with params', () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      expect(invocation.params).toEqual(mockParams);
    });

    it('should use browser_agent as default tool name', () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      expect(invocation['_toolName']).toBe('browser_agent');
    });

    it('should use custom tool name if provided', () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
        'custom_name',
        'Custom Display Name',
      );

      expect(invocation['_toolName']).toBe('custom_name');
      expect(invocation['_toolDisplayName']).toBe('Custom Display Name');
    });
  });

  describe('getDescription', () => {
    it('should return description with input summary', () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const description = invocation.getDescription();

      expect(description).toContain('browser agent');
      expect(description).toContain('task');
    });

    it('should truncate long input values', () => {
      const longParams = {
        task: 'A'.repeat(100),
      };

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        longParams,
        mockMessageBus,
      );

      const description = invocation.getDescription();

      // Should be truncated to max length
      expect(description.length).toBeLessThanOrEqual(200);
    });
  });

  describe('toolLocations', () => {
    it('should return empty array by default', () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const locations = invocation.toolLocations();

      expect(locations).toEqual([]);
    });
  });

  describe('execute metrics', () => {
    it('should record task outcome with success=true on successful run', async () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );
      const controller = new AbortController();

      await invocation.execute(controller.signal);

      expect(mockRecordBrowserTaskOutcome).toHaveBeenCalledWith(mockConfig, {
        success: true,
        session_mode: 'isolated',
        vision_enabled: false,
        headless: false,
      });
    });

    it('should record task duration on successful run', async () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );
      const controller = new AbortController();

      await invocation.execute(controller.signal);

      expect(mockRecordBrowserTaskDuration).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        { success: true, session_mode: 'isolated' },
      );
    });

    it('should record task outcome with success=false when agent result is false', async () => {
      mockExecutorRun.mockResolvedValue({
        result: JSON.stringify({ success: false, summary: 'Failed' }),
        terminate_reason: 'ERROR',
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );
      const controller = new AbortController();

      await invocation.execute(controller.signal);

      expect(mockRecordBrowserTaskOutcome).toHaveBeenCalledWith(mockConfig, {
        success: false,
        session_mode: 'isolated',
        vision_enabled: false,
        headless: false,
      });
    });

    it('should record task outcome with success=false when execute throws', async () => {
      mockCreateBrowserAgentDefinition.mockRejectedValue(
        new Error('Connection failed'),
      );

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );
      const controller = new AbortController();

      await invocation.execute(controller.signal);

      expect(mockRecordBrowserTaskOutcome).toHaveBeenCalledWith(mockConfig, {
        success: false,
        session_mode: 'persistent',
        vision_enabled: false,
        headless: false,
      });
    });

    it('should detect vision_enabled from analyze_screenshot tool', async () => {
      mockCreateBrowserAgentDefinition.mockResolvedValue({
        definition: {
          name: 'browser_agent',
          kind: 'local',
          toolConfig: {
            tools: [{ name: 'click' }, { name: 'analyze_screenshot' }],
          },
        },
        browserManager: mockBrowserManager,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );
      const controller = new AbortController();

      await invocation.execute(controller.signal);

      expect(mockRecordBrowserTaskOutcome).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({ vision_enabled: true }),
      );
    });

    it('should pass config to cleanupBrowserAgent', async () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );
      const controller = new AbortController();

      await invocation.execute(controller.signal);

      expect(mockCleanupBrowserAgent).toHaveBeenCalledWith(
        mockBrowserManager,
        mockConfig,
      );
    });

    it('should handle non-JSON result gracefully', async () => {
      mockExecutorRun.mockResolvedValue({
        result: 'not valid JSON',
        terminate_reason: 'ERROR',
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );
      const controller = new AbortController();

      await invocation.execute(controller.signal);

      expect(mockRecordBrowserTaskOutcome).toHaveBeenCalledWith(mockConfig, {
        success: false,
        session_mode: 'isolated',
        vision_enabled: false,
        headless: false,
      });
    });
  });
});
