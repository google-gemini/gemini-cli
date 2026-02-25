/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptProvider } from './promptProvider.js';
import type { Config } from '../config/config.js';
import {
  getAllGeminiMdFilenames,
  DEFAULT_CONTEXT_FILENAME,
} from '../tools/memoryTool.js';
import { PREVIEW_GEMINI_MODEL } from '../config/models.js';
import { ApprovalMode } from '../policy/types.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { MockTool } from '../test-utils/mock-tool.js';
import type { CallableTool } from '@google/genai';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

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
    mockConfig = {
      getToolRegistry: vi.fn().mockReturnValue({
        getAllToolNames: vi.fn().mockReturnValue([]),
        getAllTools: vi.fn().mockReturnValue([]),
      }),
      getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project-temp'),
        getPlansDir: vi.fn().mockReturnValue('/tmp/project-temp/plans'),
      },
      isInteractive: vi.fn().mockReturnValue(true),
      isInteractiveShellEnabled: vi.fn().mockReturnValue(true),
      getSkillManager: vi.fn().mockReturnValue({
        getSkills: vi.fn().mockReturnValue([]),
      }),
      getActiveModel: vi.fn().mockReturnValue(PREVIEW_GEMINI_MODEL),
      getAgentRegistry: vi.fn().mockReturnValue({
        getAllDefinitions: vi.fn().mockReturnValue([]),
      }),
      getApprovedPlanPath: vi.fn().mockReturnValue(undefined),
      getApprovalMode: vi.fn(),
    } as unknown as Config;
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

      expect(prompt).toContain('`mcp_read` (my-mcp-server)');
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
});
