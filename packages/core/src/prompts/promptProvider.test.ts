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
});
