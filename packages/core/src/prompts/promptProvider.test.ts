/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptProvider } from './promptProvider.js';
import { renderPlanningWorkflow } from './snippets.js';
import type { Config } from '../config/config.js';
import type { PlanningWorkflowOptions } from './snippets.js';
import { PlanComplexity } from '../plan/types.js';
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
      getPlanComplexity: vi.fn().mockReturnValue(PlanComplexity.STANDARD),
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

describe('renderPlanningWorkflow', () => {
  const baseOptions: PlanningWorkflowOptions = {
    planModeToolsList: '<tool>read_file</tool>',
    plansDir: '/tmp/plans',
    complexity: PlanComplexity.STANDARD,
  };

  it('should return empty string when options are undefined', () => {
    expect(renderPlanningWorkflow(undefined)).toBe('');
  });

  it.each([
    {
      name: 'minimal',
      complexity: PlanComplexity.MINIMAL,
      expectedSections: ['# Changes', '# Verification'],
      unexpectedSections: [
        '# Objective',
        '# Alternatives Considered',
        '# Proposed Solution',
      ],
      expectedSteps: ['**Explore:**', '**Draft:**', '**Approval:**'],
      unexpectedSteps: ['**Consult:**'],
    },
    {
      name: 'standard',
      complexity: PlanComplexity.STANDARD,
      expectedSections: [
        '# Objective',
        '# Implementation Plan',
        '# Verification',
      ],
      unexpectedSections: [
        '# Alternatives Considered',
        '# Migration & Rollback',
      ],
      expectedSteps: [
        '**Explore & Analyze:**',
        '**Consult:**',
        '**Draft:**',
        '**Review & Approval:**',
      ],
      unexpectedSteps: [],
    },
    {
      name: 'thorough',
      complexity: PlanComplexity.THOROUGH,
      expectedSections: [
        '# Background & Motivation',
        '# Scope & Impact',
        '# Proposed Solution',
        '# Alternatives Considered',
        '# Implementation Plan',
        '# Migration & Rollback',
        '# Verification',
      ],
      unexpectedSections: [],
      expectedSteps: [
        '**Deep Exploration:**',
        '**Alternatives Considered:**',
        '**Consult:**',
        '**Draft:**',
        '**Review & Approval:**',
      ],
      unexpectedSteps: [],
    },
  ])(
    '$name complexity: correct plan structure and workflow',
    ({
      complexity,
      expectedSections,
      unexpectedSections,
      expectedSteps,
      unexpectedSteps,
    }) => {
      const result = renderPlanningWorkflow({
        ...baseOptions,
        complexity,
      });

      expect(result).toContain(`Plan (${complexity})`);
      for (const section of expectedSections) {
        expect(result).toContain(section);
      }
      for (const section of unexpectedSections) {
        expect(result).not.toContain(section);
      }
      for (const step of expectedSteps) {
        expect(result).toContain(step);
      }
      for (const step of unexpectedSteps) {
        expect(result).not.toContain(step);
      }

      // All complexities should include adaptive escalation
      expect(result).toContain('## Adaptive Complexity');
      expect(result).toContain('**Auto-detection:**');
      expect(result).toContain('**Escalation:**');
    },
  );

  it('should include approved plan section when path is provided', () => {
    const result = renderPlanningWorkflow({
      ...baseOptions,
      approvedPlanPath: '/tmp/plans/my-plan.md',
    });

    expect(result).toContain('## Approved Plan');
    expect(result).toContain('/tmp/plans/my-plan.md');
  });
});
