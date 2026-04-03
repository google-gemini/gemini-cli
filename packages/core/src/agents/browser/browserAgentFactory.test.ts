/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createBrowserAgentDefinition,
  cleanupBrowserAgent,
  resetBrowserSession,
} from './browserAgentFactory.js';
import { injectAutomationOverlay } from './automationOverlay.js';
import { makeFakeConfig } from '../../test-utils/config.js';
import { PolicyDecision, PRIORITY_SUBAGENT_TOOL } from '../../policy/types.js';
import type { Config } from '../../config/config.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { PolicyEngine } from '../../policy/policy-engine.js';
import type { BrowserManager } from './browserManager.js';
import {
  recordBrowserAgentToolDiscovery,
  recordBrowserAgentVisionStatus,
  recordBrowserAgentCleanup,
} from '../../telemetry/metrics.js';

// Create mock browser manager
const mockBrowserManager = {
  ensureConnection: vi.fn().mockResolvedValue(undefined),
  getDiscoveredTools: vi.fn().mockResolvedValue([
    // Semantic tools
    { name: 'take_snapshot', description: 'Take snapshot' },
    { name: 'click', description: 'Click element' },
    { name: 'fill', description: 'Fill form field' },
    { name: 'navigate_page', description: 'Navigate to URL' },
    { name: 'type_text', description: 'Type text into an element' },
    // Visual tools (from --experimental-vision)
    { name: 'click_at', description: 'Click at coordinates' },
  ]),
  callTool: vi.fn().mockResolvedValue({ content: [] }),
  close: vi.fn().mockResolvedValue(undefined),
};

// Mock dependencies
vi.mock('./browserManager.js', () => {
  const instancesMap = new Map();
  const MockBrowserManager = vi.fn() as unknown as Record<string, unknown>;
  // Add static methods — use mockImplementation for lazy eval (hoisting-safe)
  MockBrowserManager['getInstance'] = vi.fn();
  MockBrowserManager['resetAll'] = vi.fn().mockResolvedValue(undefined);
  MockBrowserManager['instances'] = instancesMap;
  return {
    BrowserManager: MockBrowserManager,
  };
});

vi.mock('./automationOverlay.js', () => ({
  injectAutomationOverlay: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/debugLogger.js', () => ({
  debugLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../telemetry/metrics.js', () => ({
  recordBrowserAgentToolDiscovery: vi.fn(),
  recordBrowserAgentVisionStatus: vi.fn(),
  recordBrowserAgentCleanup: vi.fn(),
}));

import {
  buildBrowserSystemPrompt,
  BROWSER_AGENT_NAME,
} from './browserAgentDefinition.js';

describe('browserAgentFactory', () => {
  let mockConfig: Config;
  let mockMessageBus: MessageBus;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up getInstance to return mockBrowserManager
    // (Can't do this in vi.mock factory due to hoisting)
    const { BrowserManager: MockBM } = await import('./browserManager.js');
    (MockBM as unknown as Record<string, ReturnType<typeof vi.fn>>)[
      'getInstance'
    ].mockReturnValue(mockBrowserManager);

    vi.mocked(injectAutomationOverlay).mockClear();

    // Reset mock implementations
    mockBrowserManager.ensureConnection.mockResolvedValue(undefined);
    mockBrowserManager.getDiscoveredTools.mockResolvedValue([
      // Semantic tools
      { name: 'take_snapshot', description: 'Take snapshot' },
      { name: 'click', description: 'Click element' },
      { name: 'fill', description: 'Fill form field' },
      { name: 'navigate_page', description: 'Navigate to URL' },
      { name: 'type_text', description: 'Type text into an element' },
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

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  describe('createBrowserAgentDefinition', () => {
    it('should ensure browser connection', async () => {
      await createBrowserAgentDefinition(mockConfig, mockMessageBus);

      expect(mockBrowserManager.ensureConnection).toHaveBeenCalled();
    });

    it('should inject automation overlay when not in headless mode', async () => {
      await createBrowserAgentDefinition(mockConfig, mockMessageBus);
      expect(injectAutomationOverlay).toHaveBeenCalledWith(mockBrowserManager);
    });

    it('should not inject automation overlay when in headless mode', async () => {
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
      await createBrowserAgentDefinition(headlessConfig, mockMessageBus);
      expect(injectAutomationOverlay).not.toHaveBeenCalled();
    });

    it('should return agent definition with discovered tools', async () => {
      const { definition } = await createBrowserAgentDefinition(
        mockConfig,
        mockMessageBus,
      );

      expect(definition.name).toBe(BROWSER_AGENT_NAME);
      // 6 MCP tools (no analyze_screenshot without visualModel)
      expect(definition.toolConfig?.tools).toHaveLength(6);
    });

    it('should return browser manager for cleanup', async () => {
      const { browserManager } = await createBrowserAgentDefinition(
        mockConfig,
        mockMessageBus,
      );

      expect(browserManager).toBeDefined();
    });

    it('should not call printOutput for internal setup messages', async () => {
      const printOutput = vi.fn();

      await createBrowserAgentDefinition(
        mockConfig,
        mockMessageBus,
        printOutput,
      );

      expect(printOutput).not.toHaveBeenCalled();
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

      expect(recordBrowserAgentVisionStatus).toHaveBeenCalledWith(
        configWithVision,
        { enabled: true, disabled_reason: undefined },
      );
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

      // 6 MCP tools + 1 analyze_screenshot
      expect(definition.toolConfig?.tools).toHaveLength(7);
      const toolNames =
        definition.toolConfig?.tools
          ?.filter(
            (t): t is { name: string } => typeof t === 'object' && 'name' in t,
          )
          .map((t) => t.name) ?? [];
      expect(toolNames).toContain('analyze_screenshot');
    });

    it('should include domain restrictions in system prompt when configured', async () => {
      const configWithDomains = makeFakeConfig({
        agents: {
          browser: {
            allowedDomains: ['restricted.com'],
          },
        },
      });

      const { definition } = await createBrowserAgentDefinition(
        configWithDomains,
        mockMessageBus,
      );

      const systemPrompt = definition.promptConfig?.systemPrompt ?? '';
      expect(systemPrompt).toContain('SECURITY DOMAIN RESTRICTION - CRITICAL:');
      expect(systemPrompt).toContain('- restricted.com');
    });

    it('should include all MCP navigation tools (new_page, navigate_page) in definition', async () => {
      mockBrowserManager.getDiscoveredTools.mockResolvedValue([
        { name: 'take_snapshot', description: 'Take snapshot' },
        { name: 'click', description: 'Click element' },
        { name: 'fill', description: 'Fill form field' },
        { name: 'navigate_page', description: 'Navigate to URL' },
        { name: 'new_page', description: 'Open a new page/tab' },
        { name: 'close_page', description: 'Close page' },
        { name: 'select_page', description: 'Select page' },
        { name: 'press_key', description: 'Press key' },
        { name: 'type_text', description: 'Type text into an element' },
        { name: 'hover', description: 'Hover element' },
      ]);

      const { definition } = await createBrowserAgentDefinition(
        mockConfig,
        mockMessageBus,
      );

      const toolNames =
        definition.toolConfig?.tools
          ?.filter(
            (t): t is { name: string } => typeof t === 'object' && 'name' in t,
          )
          .map((t) => t.name) ?? [];

      // All MCP tools must be present
      expect(toolNames).toContain('new_page');
      expect(toolNames).toContain('navigate_page');
      expect(toolNames).toContain('close_page');
      expect(toolNames).toContain('select_page');
      expect(toolNames).toContain('click');
      expect(toolNames).toContain('take_snapshot');
      expect(toolNames).toContain('press_key');
      expect(toolNames).toContain('type_text');
      // Total: 9 MCP + 1 type_text (no analyze_screenshot without visualModel)
      expect(definition.toolConfig?.tools).toHaveLength(10);
    });

    it('should trigger telemetry recording for tool discovery', async () => {
      const configWithVision = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { headless: false, visualModel: 'gemini-2.5-flash-preview' },
        },
      });

      await createBrowserAgentDefinition(configWithVision, mockMessageBus);

      expect(recordBrowserAgentToolDiscovery).toHaveBeenCalledWith(
        configWithVision,
        6, // 6 mock tools from getDiscoveredTools
        [], // Empty because all required semantic tools present
        'persistent',
      );
    });

    it('should trigger telemetry recording for missing semantic tools', async () => {
      mockBrowserManager.getDiscoveredTools.mockResolvedValueOnce([
        { name: 'take_snapshot', description: 'Take snapshot' },
        // 'click', 'fill', 'navigate_page' are missing
      ]);

      const configWithVision = makeFakeConfig({
        agents: {
          overrides: { browser_agent: { enabled: true } },
          browser: { headless: false, visualModel: 'gemini-2.5-flash-preview' },
        },
      });

      await createBrowserAgentDefinition(configWithVision, mockMessageBus);

      expect(recordBrowserAgentToolDiscovery).toHaveBeenCalledWith(
        configWithVision,
        1, // 1 mock tool from getDiscoveredTools
        ['click', 'fill', 'navigate_page'],
        'persistent',
      );
    });
  });

  describe('resetBrowserSession', () => {
    it('should delegate to BrowserManager.resetAll', async () => {
      const { BrowserManager: MockBrowserManager } = await import(
        './browserManager.js'
      );
      await resetBrowserSession();
      expect(
        (
          MockBrowserManager as unknown as Record<
            string,
            ReturnType<typeof vi.fn>
          >
        )['resetAll'],
      ).toHaveBeenCalled();
    });
  });

  describe('Policy Registration', () => {
    let mockPolicyEngine: {
      addRule: ReturnType<typeof vi.fn>;
      hasRuleForTool: ReturnType<typeof vi.fn>;
      removeRulesForTool: ReturnType<typeof vi.fn>;
      getRules: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockPolicyEngine = {
        addRule: vi.fn(),
        hasRuleForTool: vi.fn().mockReturnValue(false),
        removeRulesForTool: vi.fn(),
        getRules: vi.fn().mockReturnValue([]),
      };
      vi.spyOn(mockConfig, 'getPolicyEngine').mockReturnValue(
        mockPolicyEngine as unknown as PolicyEngine,
      );
    });

    it('should register sensitive action rules', async () => {
      mockConfig = makeFakeConfig({
        agents: {
          browser: {
            confirmSensitiveActions: true,
          },
        },
      });
      vi.spyOn(mockConfig, 'getPolicyEngine').mockReturnValue(
        mockPolicyEngine as unknown as PolicyEngine,
      );

      await createBrowserAgentDefinition(mockConfig, mockMessageBus);

      expect(mockPolicyEngine.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'mcp_browser_agent_fill',
          decision: PolicyDecision.ASK_USER,
          priority: 999,
        }),
      );

      expect(mockPolicyEngine.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'mcp_browser_agent_upload_file',
          decision: PolicyDecision.ASK_USER,
          priority: 999,
        }),
      );

      expect(mockPolicyEngine.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'mcp_browser_agent_evaluate_script',
          decision: PolicyDecision.ASK_USER,
          priority: 999,
        }),
      );
    });

    it('should register fill rule even when confirmSensitiveActions is disabled', async () => {
      await createBrowserAgentDefinition(mockConfig, mockMessageBus);

      expect(mockPolicyEngine.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'mcp_browser_agent_fill',
        }),
      );

      expect(mockPolicyEngine.addRule).not.toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'mcp_browser_agent_upload_file',
        }),
      );
    });

    it('should register ALLOW rules for read-only tools', async () => {
      mockBrowserManager.getDiscoveredTools.mockResolvedValue([
        {
          name: 'take_snapshot',
          description: 'Take snapshot',
        },
        {
          name: 'take_screenshot',
          description: 'Take screenshot',
        },
        {
          name: 'list_pages',
          description: 'list all pages',
          annotations: { readOnlyHint: true },
        },
      ]);

      await createBrowserAgentDefinition(mockConfig, mockMessageBus);

      expect(mockPolicyEngine.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'mcp_browser_agent_take_snapshot',
          decision: PolicyDecision.ALLOW,
          priority: PRIORITY_SUBAGENT_TOOL,
        }),
      );

      expect(mockPolicyEngine.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'mcp_browser_agent_take_screenshot',
          decision: PolicyDecision.ALLOW,
          priority: PRIORITY_SUBAGENT_TOOL,
        }),
      );

      expect(mockPolicyEngine.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'mcp_browser_agent_list_pages',
          decision: PolicyDecision.ALLOW,
          priority: PRIORITY_SUBAGENT_TOOL,
        }),
      );
    });
  });

  describe('cleanupBrowserAgent', () => {
    it('should call close on browser manager', async () => {
      const mockConfig = makeFakeConfig({});
      await cleanupBrowserAgent(
        mockBrowserManager as unknown as BrowserManager,
        mockConfig,
        'persistent',
      );

      expect(mockBrowserManager.close).toHaveBeenCalled();
    });

    it('should handle errors during cleanup gracefully', async () => {
      const errorManager = {
        close: vi.fn().mockRejectedValue(new Error('Close failed')),
      } as unknown as BrowserManager;
      const mockConfig = makeFakeConfig({});

      // Should not throw
      await expect(
        cleanupBrowserAgent(errorManager, mockConfig, 'persistent'),
      ).resolves.toBeUndefined();
    });

    it('should record successful cleanup metrics', async () => {
      const mockConfig = makeFakeConfig({});
      await cleanupBrowserAgent(
        mockBrowserManager as unknown as BrowserManager,
        mockConfig,
        'isolated',
      );

      expect(mockBrowserManager.close).toHaveBeenCalled();
      expect(recordBrowserAgentCleanup).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        {
          session_mode: 'isolated',
          success: true,
        },
      );
    });

    it('should record failed cleanup metrics when browserManager.close() throws', async () => {
      const mockConfig = makeFakeConfig({});
      mockBrowserManager.close.mockRejectedValueOnce(
        new Error('Failed to close'),
      );

      await cleanupBrowserAgent(
        mockBrowserManager as unknown as BrowserManager,
        mockConfig,
        'existing',
      );

      expect(recordBrowserAgentCleanup).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        {
          session_mode: 'existing',
          success: false,
        },
      );
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
      expect(prompt).toContain('PROMPT INJECTION & SECURITY - CRITICAL:');
      expect(prompt).toContain('untrusted input');
    }
  });

  it('should include allowed domains restriction when provided', () => {
    const prompt = buildBrowserSystemPrompt(false, [
      'github.com',
      '*.google.com',
    ]);
    expect(prompt).toContain('SECURITY DOMAIN RESTRICTION - CRITICAL:');
    expect(prompt).toContain('- github.com');
    expect(prompt).toContain('- *.google.com');
    expect(prompt).toContain('Do NOT use proxy services');
  });

  it('should exclude allowed domains restriction when not provided or empty', () => {
    let prompt = buildBrowserSystemPrompt(false);
    expect(prompt).not.toContain('SECURITY DOMAIN RESTRICTION - CRITICAL:');

    prompt = buildBrowserSystemPrompt(false, []);
    expect(prompt).not.toContain('SECURITY DOMAIN RESTRICTION - CRITICAL:');
  });
});
