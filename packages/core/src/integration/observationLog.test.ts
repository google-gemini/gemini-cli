/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { CoreToolScheduler } from '../core/coreToolScheduler.js';
import { PromptProvider } from '../prompts/promptProvider.js';
import { ReviewTrackerService } from '../services/reviewTrackerService.js';
import { READ_FILE_TOOL_NAME } from '../tools/tool-names.js';
import type { Config } from '../index.js';
import { PolicyDecision } from '../policy/types.js';

describe('Observation Log Integration', () => {
  it('should record review in CoreToolScheduler and inject into PromptProvider', async () => {
    const reviewTracker = new ReviewTrackerService();

    // Mock Config
    const mockConfig = {
      getReviewTrackerService: () => reviewTracker,
      getUsageStatisticsEnabled: () => false,
      getDebugMode: () => false,
      getSessionId: () => 'test-session',
      getToolRegistry: () => {
        const tool = {
          name: READ_FILE_TOOL_NAME,
          description: 'test description',
          execute: async () => ({
            llmContent: 'test content',
            returnDisplay: 'test',
          }),
          build: () => ({
            execute: async () => ({
              llmContent: 'test content',
              returnDisplay: 'test',
            }),
            shouldConfirmExecute: async () => false,
            getDescription: () => 'test description',
            params: { path: 'src/main.ts' },
          }),
        };
        return {
          getTool: () => tool,
          getToolByName: () => tool,
          getFunctionDeclarations: () => [],
          getAllToolNames: () => [READ_FILE_TOOL_NAME],
        };
      },
      isInteractive: () => false, // Disable interactive mode to ensure auto-execution
      getApprovalMode: () => 'default',
      getAllowedTools: () => ['*'],
      getPolicyEngine: () => ({
        check: async () => ({ decision: PolicyDecision.ALLOW }),
      }),
      getHookSystem: () => undefined,
      getMessageBus: () => ({
        subscribe: () => {},
        publish: () => {},
      }),
      getShellExecutionConfig: () => ({}),
      getTruncateToolOutputThreshold: () => 0,
      storage: {
        getProjectTempDir: () => '/tmp',
        getProjectTempPlansDir: () => '/tmp/plans',
      },
      getActiveModel: () => 'gemini-1.5-pro',
      getToolSuggestion: () => '',
      getWorkspaceContext: () => ({
        getDirectories: () => ['/root'],
      }),
      getTargetDir: () => '/root',
      getEnableHooks: () => false,
      getAgentRegistry: () => ({ getAllDefinitions: () => [] }),
      getConfigService: () => ({ get: () => ({}) }),
      getFileExclusions: () => ({ getReadManyFilesExcludes: () => [] }),
      getFileService: () => ({
        filterFilesWithReport: () => ({ filteredPaths: [], ignoredCount: 0 }),
      }),
      getFileSystemService: () => ({}),
      getApprovedPlanPath: () => undefined,
      getEnableShellOutputEfficiency: () => true,
      isInteractiveShellEnabled: () => true,
      getFileFilteringOptions: () => ({}),
      getSkillManager: () => ({
        getSkills: () => [],
        getSkillNames: () => [],
      }),
      validatePathAccess: () => undefined,
    } as unknown as Config;

    const onAllToolCallsComplete = vi.fn();
    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate: vi.fn(),
      getPreferredEditor: () => 'vscode',
    });

    // 1. Execute a tool call (e.g., read_file)
    const request = {
      callId: '1',
      name: READ_FILE_TOOL_NAME,
      args: { path: 'src/main.ts' },
      isClientInitiated: false,
      prompt_id: 'test-prompt',
    };

    await scheduler.schedule([request], new AbortController().signal);

    // Ensure it completed
    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    // 2. Verify ReviewTracker recorded it
    expect(reviewTracker.getReviewedResources()).toContain('src/main.ts');

    // 3. Generate prompt via PromptProvider
    const promptProvider = new PromptProvider();
    const systemPrompt = promptProvider.getCoreSystemPrompt(mockConfig);

    // 4. Verify prompt contains the observation log and the mandate
    expect(systemPrompt).toContain('# Observation Log');
    expect(systemPrompt).toContain('src/main.ts');
    expect(systemPrompt).toContain('You MUST NOT claim to have reviewed');
  });
});
