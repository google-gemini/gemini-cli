/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMcpDeclarativeTools } from './mcpToolWrapper.js';
import { createBrowserAgentDefinition } from './browserAgentFactory.js';
import type { BrowserManager, McpToolCallResult } from './browserManager.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '../../config/config.js';
import {
  PolicyDecision,
  ApprovalMode,
  PRIORITY_SUBAGENT_TOOL,
} from '../../policy/types.js';

vi.mock('./browserManager.js');
vi.mock('./automationOverlay.js');
vi.mock('./inputBlocker.js');

describe('Browser Agent Sensitive Actions', () => {
  let mockBrowserManager: BrowserManager;
  let mockMessageBus: MessageBus;
  let mockMcpTools: McpTool[];
  let mockConfig: Config;
  let mockPolicyEngine: {
    addRule: ReturnType<typeof vi.fn>;
    hasRuleForTool: ReturnType<typeof vi.fn>;
    removeRulesForTool: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetAllMocks();

    mockMcpTools = [
      {
        name: 'upload_file',
        description: 'Upload a file',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
      {
        name: 'fill_form',
        description: 'Fill a form',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'evaluate_script',
        description: 'Run JS',
        inputSchema: {
          type: 'object',
          properties: { script: { type: 'string' } },
        },
      },
      {
        name: 'take_snapshot',
        description: 'Take snapshot',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    mockPolicyEngine = {
      addRule: vi.fn(),
      hasRuleForTool: vi.fn().mockReturnValue(false),
      removeRulesForTool: vi.fn(),
    };

    mockConfig = {
      getBrowserAgentConfig: vi.fn().mockReturnValue({
        enabled: true,
        customConfig: {
          headless: true,
          confirmSensitiveActions: false,
          blockFileUploads: false,
        },
      }),
      getModel: vi.fn().mockReturnValue('gemini-1.5-pro'),
      shouldDisableBrowserUserInput: vi.fn().mockReturnValue(false),
      getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue({ authType: 'api_key' }),
    } as unknown as Config;

    mockBrowserManager = {
      ensureConnection: vi.fn().mockResolvedValue(undefined),
      getDiscoveredTools: vi.fn().mockResolvedValue(mockMcpTools),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }],
      } as McpToolCallResult),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BrowserManager;

    // mocking private constructor
    import('./browserManager.js')
      .then((m) => {
        // @ts-expect-error - mocking private constructor
        m.BrowserManager.mockImplementation(() => mockBrowserManager);
      })
      .catch(() => {});

    mockMessageBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Hard Block: upload_file', () => {
    it('should block upload_file when blockFileUploads is true', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        false,
        true, // blockFileUploads
      );

      const uploadTool = tools.find((t) => t.name === 'upload_file')!;
      const invocation = uploadTool.build({ path: 'test.txt' });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('File uploads are blocked');
      expect(mockBrowserManager.callTool).not.toHaveBeenCalled();
    });

    it('should NOT block upload_file when blockFileUploads is false', async () => {
      const tools = await createMcpDeclarativeTools(
        mockBrowserManager,
        mockMessageBus,
        false,
        false, // blockFileUploads
      );

      const uploadTool = tools.find((t) => t.name === 'upload_file')!;
      const invocation = uploadTool.build({ path: 'test.txt' });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toBe('Success');
      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'upload_file',
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('Policy Registration', () => {
    it('should register sensitive action rules in YOLO mode', async () => {
      // Need to use the actual BrowserManager mock from factory
      const { BrowserManager } = await import('./browserManager.js');
      // mocking private constructor
      (
        BrowserManager as unknown as {
          mockImplementation: ReturnType<typeof vi.fn>;
        }
      ).mockImplementation(() => mockBrowserManager);

      await createBrowserAgentDefinition(mockConfig, mockMessageBus);

      // Check for upload_file rule
      expect(mockPolicyEngine.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'upload_file',
          decision: PolicyDecision.ASK_USER,
          priority: 999,
          modes: [ApprovalMode.YOLO],
        }),
      );

      // Check for evaluate_script rule
      expect(mockPolicyEngine.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'evaluate_script',
          decision: PolicyDecision.ASK_USER,
          priority: 999,
          modes: [ApprovalMode.YOLO],
        }),
      );
    });

    it('should register fill_form rule only when confirmSensitiveActions is enabled', async () => {
      const { BrowserManager } = await import('./browserManager.js');
      // mocking private constructor
      (
        BrowserManager as unknown as {
          mockImplementation: ReturnType<typeof vi.fn>;
        }
      ).mockImplementation(() => mockBrowserManager);

      // 1. Disabled
      await createBrowserAgentDefinition(mockConfig, mockMessageBus);
      expect(mockPolicyEngine.addRule).not.toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'fill_form',
        }),
      );

      // 2. Enabled
      vi.mocked(mockConfig.getBrowserAgentConfig).mockReturnValue({
        enabled: true,
        customConfig: {
          headless: true,
          confirmSensitiveActions: true,
          blockFileUploads: false,
        },
      });

      await createBrowserAgentDefinition(mockConfig, mockMessageBus);
      expect(mockPolicyEngine.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'fill_form',
          decision: PolicyDecision.ASK_USER,
          priority: 999,
          modes: [ApprovalMode.YOLO],
        }),
      );
    });

    it('should register ALLOW rules for read-only tools', async () => {
      const { BrowserManager } = await import('./browserManager.js');
      // mocking private constructor
      (
        BrowserManager as unknown as {
          mockImplementation: ReturnType<typeof vi.fn>;
        }
      ).mockImplementation(() => mockBrowserManager);

      await createBrowserAgentDefinition(mockConfig, mockMessageBus);

      expect(mockPolicyEngine.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'take_snapshot',
          decision: PolicyDecision.ALLOW,
          priority: PRIORITY_SUBAGENT_TOOL,
        }),
      );
    });
  });
});
