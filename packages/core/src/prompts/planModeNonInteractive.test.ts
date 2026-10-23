/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderPlanningWorkflow } from './snippets.js';
import { PromptProvider } from './promptProvider.js';
import { ApprovalMode } from '../policy/types.js';
import type { Config } from '../config/config.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { TopicState } from '../config/topicState.js';

vi.mock('../tools/memoryTool.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../tools/memoryTool.js')>();
  return {
    ...actual,
    getAllGeminiMdFilenames: vi.fn().mockReturnValue([]),
  };
});

vi.mock('../utils/gitUtils.js', () => ({
  isGitRepository: vi.fn().mockReturnValue(false),
}));

describe('Plan Mode Non-Interactive Workflow', () => {
  describe('renderPlanningWorkflow', () => {
    it('should return empty string when options is undefined', () => {
      expect(renderPlanningWorkflow(undefined)).toBe('');
    });

    it('should include consultation, alignment check, and wait directives in interactive mode', () => {
      const prompt = renderPlanningWorkflow({
        interactive: true,
        plansDir: 'plans',
        planModeToolsList: '- read_file\n- grep_search',
      });

      // Goal
      expect(prompt).toContain('get user approval before editing source code.');

      // Rule 3
      expect(prompt).toContain(
        'If the request is ambiguous, use `ask_user` to clarify.',
      );

      // Step 2: Consult
      expect(prompt).toContain('### 2. Consult');
      expect(prompt).toContain('STOP and wait');
      expect(prompt).toContain(
        'You MUST NOT proceed to Step 3 (Draft) or Step 4',
      );
      expect(prompt).toContain('`ask_user`');

      // Step 3: Alignment Check
      expect(prompt).toContain('Alignment Check:');

      // Step 4: Review & Approval
      expect(prompt).toContain('AFTER you have reached an informal agreement');
      expect(prompt).toContain('formally request approval.');
    });

    it('should NOT halt or wait for user agreement in non-interactive mode', () => {
      const prompt = renderPlanningWorkflow({
        interactive: false,
        plansDir: 'plans',
        planModeToolsList: '- read_file\n- grep_search',
      });

      // Goal
      expect(prompt).toContain(
        'create a design document before proceeding autonomously.',
      );
      expect(prompt).not.toContain(
        'get user approval before editing source code.',
      );

      // Rule 3 should not reference ask_user
      expect(prompt).toContain(
        'Autonomously combine discovery and drafting phases to minimize conversational turns.',
      );
      expect(prompt).not.toContain('`ask_user`');

      // Step 2 should be Determine Strategy, not Consult
      expect(prompt).toContain('### 2. Determine Strategy');
      expect(prompt).not.toContain('### 2. Consult');
      expect(prompt).not.toContain('STOP and wait');
      expect(prompt).not.toContain(
        'You MUST NOT proceed to Step 3 (Draft) or Step 4',
      );
      expect(prompt).not.toContain('You MUST wait for user feedback');

      // Step 3 should not require Alignment Check with human
      expect(prompt).not.toContain('Alignment Check:');

      // Step 4 should begin implementation without informal agreement
      expect(prompt).not.toContain(
        'AFTER you have reached an informal agreement',
      );
      expect(prompt).toContain('begin implementation.');
    });
  });

  describe('PromptProvider in non-interactive Plan Mode', () => {
    let mockConfig: Config;

    beforeEach(() => {
      const mockToolRegistry = {
        getAllToolNames: vi
          .fn()
          .mockReturnValue(['read_file', 'exit_plan_mode']),
        getAllTools: vi.fn().mockReturnValue([]),
      } as unknown as ToolRegistry;

      mockConfig = {
        get config() {
          return this as unknown as Config;
        },
        get toolRegistry() {
          return mockToolRegistry;
        },
        getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
        getProjectRoot: vi.fn().mockReturnValue('/tmp/test-project'),
        topicState: new TopicState(),
        getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
        getSandboxEnabled: vi.fn().mockReturnValue(false),
        storage: {
          getPlansDir: vi.fn().mockReturnValue('/tmp/test-project/plans'),
          getProjectMemoryDir: vi
            .fn()
            .mockReturnValue('/tmp/test-project/memory'),
          getProjectTempTrackerDir: vi
            .fn()
            .mockReturnValue('/tmp/test-project/tracker'),
        },
        isInteractive: vi.fn().mockReturnValue(false),
        isInteractiveShellEnabled: vi.fn().mockReturnValue(false),
        isTopicUpdateNarrationEnabled: vi.fn().mockReturnValue(false),
        getSkillManager: vi.fn().mockReturnValue({
          getSkills: vi.fn().mockReturnValue([]),
        }),
        getActiveModel: vi.fn().mockReturnValue('gemini-3.1-pro-preview'),
        getAgentRegistry: vi.fn().mockReturnValue({
          getAllDefinitions: vi.fn().mockReturnValue([]),
          getDefinition: vi.fn().mockReturnValue(undefined),
        }),
        getApprovedPlanPath: vi.fn().mockReturnValue(undefined),
        getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.PLAN),
        isTrackerEnabled: vi.fn().mockReturnValue(false),
        getHasAccessToPreviewModel: vi.fn().mockReturnValue(true),
        getGemini31LaunchedSync: vi.fn().mockReturnValue(true),
      } as unknown as Config;
    });

    it('should generate an autonomous prompt without blocking user agreement steps when non-interactive', () => {
      const provider = new PromptProvider();
      const prompt = provider.getCoreSystemPrompt(mockConfig);

      expect(prompt).toContain('# Active Approval Mode: Plan');
      expect(prompt).toContain(
        'create a design document before proceeding autonomously.',
      );
      expect(prompt).toContain('### 2. Determine Strategy');
      expect(prompt).not.toContain('STOP and wait');
      expect(prompt).not.toContain(
        'You MUST NOT proceed to Step 3 (Draft) or Step 4',
      );
      expect(prompt).not.toContain(
        'AFTER you have reached an informal agreement',
      );
      expect(prompt).toContain('begin implementation.');
    });

    it('should generate an interactive prompt with consultation steps when interactive is true', () => {
      vi.mocked(mockConfig.isInteractive).mockReturnValue(true);

      const provider = new PromptProvider();
      const prompt = provider.getCoreSystemPrompt(mockConfig);

      expect(prompt).toContain('# Active Approval Mode: Plan');
      expect(prompt).toContain('get user approval before editing source code.');
      expect(prompt).toContain('### 2. Consult');
      expect(prompt).toContain('STOP and wait');
      expect(prompt).toContain(
        'You MUST NOT proceed to Step 3 (Draft) or Step 4',
      );
      expect(prompt).toContain('AFTER you have reached an informal agreement');
      expect(prompt).toContain('formally request approval.');
    });
  });
});
