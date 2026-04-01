/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptProvider } from './promptProvider.js';
import { type AgentLoopContext } from '../config/agent-loop-context.js';
import { type TeamDefinition } from '../agents/types.js';

describe('PromptProvider with Agent Teams', () => {
  let promptProvider: PromptProvider;
  let mockContext: AgentLoopContext;
  const mockGetActiveTeam = vi.fn();

  beforeEach(() => {
    promptProvider = new PromptProvider();
    mockGetActiveTeam.mockReturnValue(undefined);
    mockContext = {
      config: {
        isInteractive: vi.fn().mockReturnValue(true),
        getSkillManager: vi.fn().mockReturnValue({ getSkills: () => [] }),
        getAgentRegistry: vi
          .fn()
          .mockReturnValue({ getAllDefinitions: () => [] }),
        getActiveModel: vi.fn().mockReturnValue('gemini-3.1-pro-preview'),
        getActiveTeam: mockGetActiveTeam,
        getApprovedPlanPath: vi.fn().mockReturnValue(undefined),
        getApprovalMode: vi.fn().mockReturnValue('default'),
        getGemini31LaunchedSync: vi.fn().mockReturnValue(true),
        getGemini31FlashLiteLaunchedSync: vi.fn().mockReturnValue(true),
        getHasAccessToPreviewModel: vi.fn().mockReturnValue(true),
        isTrackerEnabled: vi.fn().mockReturnValue(false),
        isTopicUpdateNarrationEnabled: vi.fn().mockReturnValue(false),
        isMemoryManagerEnabled: vi.fn().mockReturnValue(false),
        isInteractiveShellEnabled: vi.fn().mockReturnValue(true),
        getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
        getSandboxEnabled: vi.fn().mockReturnValue(false),
        storage: {
          getPlansDir: vi.fn().mockReturnValue('/tmp/plans'),
        },
        topicState: {
          getTopic: vi.fn().mockReturnValue(undefined),
        },
      },
      toolRegistry: {
        getAllToolNames: vi.fn().mockReturnValue([]),
        getAllTools: vi.fn().mockReturnValue([]),
      },
    } as unknown as AgentLoopContext;
  });

  it('should not include team section when no team is active', () => {
    const prompt = promptProvider.getCoreSystemPrompt(mockContext);
    expect(prompt).not.toContain('# Active Agent Team');
  });

  it('should include team section when a team is active', () => {
    const mockTeam: TeamDefinition = {
      name: 'test-team',
      displayName: 'Test Team',
      description: 'A test team',
      instructions: 'These are the team instructions.',
      agents: [],
    };
    mockGetActiveTeam.mockReturnValue(mockTeam);

    const prompt = promptProvider.getCoreSystemPrompt(mockContext);
    expect(prompt).toContain('# Active Agent Team: Test Team');
    expect(prompt).toContain('These are the team instructions.');
    expect(prompt).toContain(
      "You should prioritize delegating tasks to this team's agents whenever appropriate.",
    );
  });
});
