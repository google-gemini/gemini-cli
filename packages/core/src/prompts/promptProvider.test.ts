/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PromptProvider } from './promptProvider.js';
import type { Config } from '../config/config.js';
import {
  getAllGeminiMdFilenames,
  DEFAULT_CONTEXT_FILENAME,
} from '../tools/memoryTool.js';
import {
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../config/models.js';
import { ApprovalMode } from '../policy/types.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { MockTool } from '../test-utils/mock-tool.js';
import { UPDATE_TOPIC_TOOL_NAME } from '../tools/tool-names.js';
import { TopicState } from '../config/topicState.js';
import type { CallableTool } from '@google/genai';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ToolRegistry } from '../tools/tool-registry.js';

vi.mock('../tools/memoryTool.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    getAllGeminiMdFilenames: vi.fn(),
  };
});

vi.mock('../utils/gitUtils', () => ({
  isGitRepository: vi.fn().mockReturnValue(false),
}));

describe('PromptProvider', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GEMINI_SYSTEM_MD', '');
    vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', '');

    const mockToolRegistry = {
      getAllToolNames: vi.fn().mockReturnValue([]),
      getAllTools: vi.fn().mockReturnValue([]),
    };
    mockConfig = {
      get config() {
        return this as unknown as Config;
      },
      get toolRegistry() {
        return (
          this as { getToolRegistry: () => ToolRegistry }
        ).getToolRegistry?.() as unknown as ToolRegistry;
      },
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      topicState: new TopicState(),
      getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
      getSandboxEnabled: vi.fn().mockReturnValue(false),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project-temp'),
        getPlansDir: vi.fn().mockReturnValue('/tmp/project-temp/plans'),
        getProjectTempTrackerDir: vi
          .fn()
          .mockReturnValue('/tmp/project-temp/tracker'),
      },
      isInteractive: vi.fn().mockReturnValue(true),
      isInteractiveShellEnabled: vi.fn().mockReturnValue(true),
      isTopicUpdateNarrationEnabled: vi.fn().mockReturnValue(false),
      isMemoryManagerEnabled: vi.fn().mockReturnValue(false),
      getSkillManager: vi.fn().mockReturnValue({
        getSkills: vi.fn().mockReturnValue([]),
      }),
      getActiveModel: vi.fn().mockReturnValue(PREVIEW_GEMINI_MODEL),
      getAgentRegistry: vi.fn().mockReturnValue({
        getAllDefinitions: vi.fn().mockReturnValue([]),
      }),
      getApprovedPlanPath: vi.fn().mockReturnValue(undefined),
      getApprovalMode: vi.fn(),
      isTrackerEnabled: vi.fn().mockReturnValue(false),
      getHasAccessToPreviewModel: vi.fn().mockReturnValue(true),
      getGemini31LaunchedSync: vi.fn().mockReturnValue(true),
      isSimpleContextModeEnabled: vi.fn().mockReturnValue(false),
      isLocalGemmaModel: vi.fn().mockReturnValue(false),
    } as unknown as Config;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should handle multiple context filenames in the system prompt', () => {
    vi.mocked(getAllGeminiMdFilenames).mockReturnValue([
      DEFAULT_CONTEXT_FILENAME,
      'CUSTOM.md',
      'ANOTHER.md',
    ]);

    const provider = new PromptProvider();
    const prompt = provider.getCoreSystemPrompt(mockConfig);

    // Verify renderCoreMandates usage
    expect(prompt).toContain(
      `Instructions found in \`${DEFAULT_CONTEXT_FILENAME}\`, \`CUSTOM.md\` or \`ANOTHER.md\` files are foundational mandates.`,
    );
  });

  it('should include the task tracker storage location in the system prompt', () => {
    vi.mocked(mockConfig.isTrackerEnabled).mockReturnValue(true);
    const mockTrackerDir = '/mock/tracker/path';
    vi.mocked(mockConfig.storage.getProjectTempTrackerDir).mockReturnValue(
      mockTrackerDir,
    );

    const provider = new PromptProvider();
    const prompt = provider.getCoreSystemPrompt(mockConfig);

    expect(prompt).toContain('# TASK MANAGEMENT PROTOCOL');
    expect(prompt).toContain(`located at \`${mockTrackerDir}\``);
  });

  it('should sanitize the task tracker storage location in the system prompt', () => {
    vi.mocked(mockConfig.isTrackerEnabled).mockReturnValue(true);
    const mockTrackerDir = '/mock/tracker/path\nwith-newline]and-bracket';
    vi.mocked(mockConfig.storage.getProjectTempTrackerDir).mockReturnValue(
      mockTrackerDir,
    );

    const provider = new PromptProvider();
    const prompt = provider.getCoreSystemPrompt(mockConfig);

    expect(prompt).toContain('# TASK MANAGEMENT PROTOCOL');
    expect(prompt).toContain(
      'located at `/mock/tracker/path with-newlineand-bracket`',
    );
  });

  it('should handle multiple context filenames in user memory section', () => {
    vi.mocked(getAllGeminiMdFilenames).mockReturnValue([
      DEFAULT_CONTEXT_FILENAME,
      'CUSTOM.md',
    ]);

    const provider = new PromptProvider();
    const prompt = provider.getCoreSystemPrompt(
      mockConfig,
      'Some memory content',
    );

    // Verify renderUserMemory usage
    expect(prompt).toContain(
      `# Contextual Instructions (${DEFAULT_CONTEXT_FILENAME}, CUSTOM.md)`,
    );
  });

  it('should use the compact local gemma prompt in simple context mode', () => {
    vi.mocked(mockConfig.getActiveModel).mockReturnValue('gemma4:31b');
    vi.mocked(mockConfig.isSimpleContextModeEnabled).mockReturnValue(true);
    vi.mocked(mockConfig.isLocalGemmaModel).mockReturnValue(true);

    const provider = new PromptProvider();
    const prompt = provider.getCoreSystemPrompt(mockConfig);

    expect(prompt).toContain('local Gemma mode');
    expect(prompt).toContain(
      'Once you know the next step, call the tool immediately.',
    );
    expect(prompt).toContain('Do not keep repeating the plan.');
    expect(prompt).toContain(
      'Do not use shell redirection, heredocs, or chmod as a substitute for `write_file`.',
    );
    expect(prompt).toContain(
      'Do not stall in planning or stop after only creating a directory.',
    );
    expect(prompt).not.toContain('# Available Agent Skills');
    expect(prompt).not.toContain('# Core Mandates');
  });

  describe('plan mode prompt', () => {
    const mockMessageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;

    beforeEach(() => {
      vi.mocked(getAllGeminiMdFilenames).mockReturnValue([
        DEFAULT_CONTEXT_FILENAME,
      ]);
      (mockConfig.getApprovalMode as ReturnType<typeof vi.fn>).mockReturnValue(
        ApprovalMode.PLAN,
      );
    });

    it('should list all active tools from ToolRegistry in plan mode prompt', () => {
      const mockTools = [
        new MockTool({ name: 'glob', displayName: 'Glob' }),
        new MockTool({ name: 'read_file', displayName: 'ReadFile' }),
        new MockTool({ name: 'write_file', displayName: 'WriteFile' }),
        new MockTool({ name: 'replace', displayName: 'Replace' }),
      ];
      (mockConfig.getToolRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
        getAllToolNames: vi.fn().mockReturnValue(mockTools.map((t) => t.name)),
        getAllTools: vi.fn().mockReturnValue(mockTools),
      });

      const provider = new PromptProvider();
      const prompt = provider.getCoreSystemPrompt(mockConfig);

      expect(prompt).toContain('`glob`');
      expect(prompt).toContain('`read_file`');
      expect(prompt).toContain('`write_file`');
      expect(prompt).toContain('`replace`');
    });

    it('should show server name for MCP tools in plan mode prompt', () => {
      const mcpTool = new DiscoveredMCPTool(
        {} as CallableTool,
        'my-mcp-server',
        'mcp_read',
        'An MCP read tool',
        {},
        mockMessageBus,
        undefined,
        true,
      );
      const mockTools = [
        new MockTool({ name: 'glob', displayName: 'Glob' }),
        mcpTool,
      ];
      (mockConfig.getToolRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
        getAllToolNames: vi.fn().mockReturnValue(mockTools.map((t) => t.name)),
        getAllTools: vi.fn().mockReturnValue(mockTools),
      });

      const provider = new PromptProvider();
      const prompt = provider.getCoreSystemPrompt(mockConfig);

      expect(prompt).toContain('`mcp_my-mcp-server_mcp_read` (my-mcp-server)');
    });

    it('should include write constraint message in plan mode prompt', () => {
      const mockTools = [
        new MockTool({ name: 'glob', displayName: 'Glob' }),
        new MockTool({ name: 'write_file', displayName: 'WriteFile' }),
        new MockTool({ name: 'replace', displayName: 'Replace' }),
      ];
      (mockConfig.getToolRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
        getAllToolNames: vi.fn().mockReturnValue(mockTools.map((t) => t.name)),
        getAllTools: vi.fn().mockReturnValue(mockTools),
      });

      const provider = new PromptProvider();
      const prompt = provider.getCoreSystemPrompt(mockConfig);

      expect(prompt).toContain(
        '`write_file` and `replace` may ONLY be used to write .md plan files',
      );
      expect(prompt).toContain('/tmp/project-temp/plans/');
    });
  });

  describe('getCompressionPrompt', () => {
    it('should include plan preservation instructions when an approved plan path is provided', () => {
      const planPath = '/path/to/plan.md';
      (
        mockConfig.getApprovedPlanPath as ReturnType<typeof vi.fn>
      ).mockReturnValue(planPath);

      const provider = new PromptProvider();
      const prompt = provider.getCompressionPrompt(mockConfig);

      expect(prompt).toContain('### APPROVED PLAN PRESERVATION');
      expect(prompt).toContain(planPath);

      // Verify it's BEFORE the structure example
      const structureMarker = 'The structure MUST be as follows:';
      const planPreservationMarker = '### APPROVED PLAN PRESERVATION';

      const structureIndex = prompt.indexOf(structureMarker);
      const planPreservationIndex = prompt.indexOf(planPreservationMarker);

      expect(planPreservationIndex).toBeGreaterThan(-1);
      expect(structureIndex).toBeGreaterThan(-1);
      expect(planPreservationIndex).toBeLessThan(structureIndex);
    });

    it('should NOT include plan preservation instructions when no approved plan path is provided', () => {
      (
        mockConfig.getApprovedPlanPath as ReturnType<typeof vi.fn>
      ).mockReturnValue(undefined);

      const provider = new PromptProvider();
      const prompt = provider.getCompressionPrompt(mockConfig);

      expect(prompt).not.toContain('### APPROVED PLAN PRESERVATION');
    });

    it('should use the compact compression prompt for local gemma simple context mode', () => {
      vi.mocked(mockConfig.getActiveModel).mockReturnValue('gemma4:31b');
      vi.mocked(mockConfig.isSimpleContextModeEnabled).mockReturnValue(true);
      vi.mocked(mockConfig.isLocalGemmaModel).mockReturnValue(true);

      const provider = new PromptProvider();
      const prompt = provider.getCompressionPrompt(mockConfig);

      expect(prompt).toContain(
        'You are compressing chat history into a durable XML state snapshot.',
      );
      expect(prompt).toContain('<state_snapshot>');
      expect(prompt).not.toContain('CRITICAL SECURITY RULE');
    });
  });

  describe('Topic & Update Narration', () => {
    beforeEach(() => {
      mockConfig.topicState.reset();
      vi.mocked(mockConfig.isTopicUpdateNarrationEnabled).mockReturnValue(true);
      (mockConfig.getToolRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
        getAllToolNames: vi.fn().mockReturnValue([UPDATE_TOPIC_TOOL_NAME]),
        getAllTools: vi.fn().mockReturnValue([
          new MockTool({
            name: UPDATE_TOPIC_TOOL_NAME,
            displayName: 'Topic',
          }),
        ]),
      });
      vi.mocked(mockConfig.getHasAccessToPreviewModel).mockReturnValue(true);
      vi.mocked(mockConfig.getGemini31LaunchedSync).mockReturnValue(true);
    });

    it('should include active topic context when narration is enabled', () => {
      mockConfig.topicState.setTopic('Active Chapter');
      const provider = new PromptProvider();
      const prompt = provider.getCoreSystemPrompt(mockConfig);

      expect(prompt).toContain('[Active Topic: Active Chapter]');
    });

    it('should NOT include active topic context when narration is disabled', () => {
      vi.mocked(mockConfig.isTopicUpdateNarrationEnabled).mockReturnValue(
        false,
      );
      mockConfig.topicState.setTopic('Active Chapter');
      const provider = new PromptProvider();
      const prompt = provider.getCoreSystemPrompt(mockConfig);

      expect(prompt).not.toContain('[Active Topic: Active Chapter]');
    });

    it('should filter out update_topic tool when narration is disabled', () => {
      vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.PLAN);
      vi.mocked(mockConfig.isTopicUpdateNarrationEnabled).mockReturnValue(
        false,
      );
      // Simulate registry behavior where it filters out update_topic
      vi.mocked(mockConfig.getToolRegistry().getAllToolNames).mockReturnValue(
        [],
      );
      vi.mocked(mockConfig.getToolRegistry().getAllTools).mockReturnValue([]);

      const provider = new PromptProvider();

      const prompt = provider.getCoreSystemPrompt(mockConfig);
      expect(prompt).not.toContain(UPDATE_TOPIC_TOOL_NAME);
    });

    it('should NOT filter out update_topic tool when narration is enabled', () => {
      vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.PLAN);
      vi.mocked(mockConfig.isTopicUpdateNarrationEnabled).mockReturnValue(true);
      const provider = new PromptProvider();
      const prompt = provider.getCoreSystemPrompt(mockConfig);

      expect(prompt).toContain(`<tool>\`${UPDATE_TOPIC_TOOL_NAME}\`</tool>`);
    });

    it('should include topic update instructions in legacy model prompt when enabled', () => {
      vi.mocked(mockConfig.getActiveModel).mockReturnValue(
        DEFAULT_GEMINI_MODEL,
      );
      vi.mocked(mockConfig.isTopicUpdateNarrationEnabled).mockReturnValue(true);

      const provider = new PromptProvider();
      const prompt = provider.getCoreSystemPrompt(mockConfig);

      expect(prompt).toContain('## Topic Updates');
      expect(prompt).toContain(UPDATE_TOPIC_TOOL_NAME);
      expect(prompt).toContain('No Chitchat');
      expect(prompt).toContain('Topic Model');
    });
  });
});
