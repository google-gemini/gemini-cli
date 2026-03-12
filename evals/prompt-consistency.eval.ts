/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, vi } from 'vitest';
import { evalTest } from './test-helper.js';
import {
  PREVIEW_GEMINI_MODEL,
  Config,
  getCoreSystemPrompt,
} from '@google/gemini-cli-core';

// Mock external dependencies that PromptProvider uses
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    getAllGeminiMdFilenames: vi.fn().mockReturnValue(['GEMINI.md']),
    isGitRepository: vi.fn().mockReturnValue(false),
  };
});

describe('System Prompt Consistency', () => {
  // Create a mock config similar to promptProvider.test.ts
  const mockConfig = {
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
    isTrackerEnabled: vi.fn().mockReturnValue(false),
    getGemini31LaunchedSync: vi.fn().mockReturnValue(false),
  } as unknown as Config;

  const systemPrompt = getCoreSystemPrompt(mockConfig);

  evalTest('USUALLY_PASSES', {
    name: 'should not have previously unseen contradictions in the system prompt',
    prompt: `
Analyze the system prompt provided in system_prompt.md.
Identify any logical contradictions, ambiguities, or conflicting instructions.

Return ONLY valid JSON in this format:
{
  "issues": [
    {
      "type": "contradiction | ambiguity",
      "description": "short explanation",
      "snippets": ["snippet1", "snippet2"]
    }
  ]
}

If no issues are found, return {"issues": []}.
`,
    files: {
      'system_prompt.md': systemPrompt,
    },
    assert: async (rig, result) => {
      // Extract JSON from result
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        if (
          result.toLowerCase().includes('no contradiction') ||
          result.toLowerCase().includes('no issues')
        ) {
          return;
        }
        throw new Error(
          'LLM did not return valid JSON or clear "no issues" message',
        );
      }

      interface Issue {
        type: string;
        description: string;
        snippets: string[];
      }

      let issues: Issue[] = [];
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        issues = parsed.issues || [];
      } catch {
        return;
      }

      const allowList = [
        'instruction to refactor code conflicts with instruction to avoid unrelated refactoring',
        'refactor the entire core package to be better',
      ];

      const normalize = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .trim();

      const normalizedAllow = allowList.map(normalize);

      const newIssues = issues.filter((issue) => {
        const desc = normalize(issue.description);
        return !normalizedAllow.some((allowed) => desc.includes(allowed));
      });

      if (newIssues.length > 0) {
        console.error('New prompt contradictions detected:');
        console.error(JSON.stringify(newIssues, null, 2));
      }

      expect(
        newIssues,
        `Found new prompt issues: ${JSON.stringify(newIssues)}`,
      ).toHaveLength(0);
    },
  });
});
