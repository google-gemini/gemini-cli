/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { suggestPolicyScope } from './suggestion-generator.js';
import type { Config } from '../config/config.js';
import type { SerializableConfirmationDetails } from '../confirmation-bus/types.js';
import { logPolicySuggestion } from '../telemetry/index.js';

vi.mock('../telemetry/index.js', () => ({
  logPolicySuggestion: vi.fn(),
  PolicySuggestionEvent: vi.fn(),
  LlmRole: { SUBAGENT: 'subagent' },
}));

describe('suggestPolicyScope', () => {
  let mockConfig: Config;
  let mockGenerateContent: ReturnType<typeof vi.fn>;

  const execDetails: SerializableConfirmationDetails = {
    type: 'exec',
    title: 'Confirm Shell Command',
    command: 'git diff src/main.ts',
    rootCommand: 'git, diff',
    rootCommands: ['git', 'diff'],
  };

  const editDetails: SerializableConfirmationDetails = {
    type: 'edit',
    title: 'Apply Changes',
    fileName: 'Button.tsx',
    filePath: 'src/components/Button.tsx',
    fileDiff: '+ new line',
    originalContent: 'old',
    newContent: 'new',
  };

  const mcpDetails: SerializableConfirmationDetails = {
    type: 'mcp',
    title: 'MCP Tool',
    serverName: 'jira-server',
    toolName: 'search_issues',
    toolDisplayName: 'Search Issues',
    toolDescription: 'Search for Jira issues',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockGenerateContent = vi.fn();
    mockConfig = {
      getContentGenerator: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    } as unknown as Config;
  });

  it('should return a valid suggestion for exec tools', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  description: 'Allow git read-only commands',
                  commandPrefix: ['git diff', 'git log', 'git status'],
                }),
              },
            ],
          },
        },
      ],
    });

    const result = await suggestPolicyScope(
      execDetails,
      'run_shell_command',
      mockConfig,
    );

    expect(result).toEqual({
      description: 'Allow git read-only commands',
      commandPrefix: ['git diff', 'git log', 'git status'],
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('should return a valid suggestion for edit tools', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  description: 'Allow edits to src/components/',
                }),
              },
            ],
          },
        },
      ],
    });

    const result = await suggestPolicyScope(
      editDetails,
      'edit_file',
      mockConfig,
    );

    expect(result).toEqual({
      description: 'Allow edits to src/components/',
    });
  });

  it('should return a valid suggestion for MCP tools', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  description: 'Allow read-only Jira operations',
                  toolName: 'search_issues',
                }),
              },
            ],
          },
        },
      ],
    });

    const result = await suggestPolicyScope(
      mcpDetails,
      'jira-server__search_issues',
      mockConfig,
    );

    expect(result).toEqual({
      description: 'Allow read-only Jira operations',
      toolName: 'search_issues',
    });
  });

  it('should return null when content generator is not available', async () => {
    const noGenConfig = {
      getContentGenerator: vi.fn().mockReturnValue(null),
    } as unknown as Config;

    const result = await suggestPolicyScope(
      execDetails,
      'run_shell_command',
      noGenConfig,
    );
    expect(result).toBeNull();
  });

  it('should return null for ask_user confirmation type', async () => {
    const askUserDetails: SerializableConfirmationDetails = {
      type: 'ask_user',
      title: 'Question',
      questions: [],
    };

    const result = await suggestPolicyScope(
      askUserDetails,
      'ask_user',
      mockConfig,
    );
    expect(result).toBeNull();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('should return null for exit_plan_mode confirmation type', async () => {
    const planDetails: SerializableConfirmationDetails = {
      type: 'exit_plan_mode',
      title: 'Exit Plan',
      planPath: '/tmp/plan.md',
    };

    const result = await suggestPolicyScope(
      planDetails,
      'exit_plan_mode',
      mockConfig,
    );
    expect(result).toBeNull();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('should return null on LLM call failure', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API error'));

    const result = await suggestPolicyScope(
      execDetails,
      'run_shell_command',
      mockConfig,
    );
    expect(result).toBeNull();
    expect(logPolicySuggestion).toHaveBeenCalled();
  });

  it('should return null on empty LLM response', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [],
    });

    const result = await suggestPolicyScope(
      execDetails,
      'run_shell_command',
      mockConfig,
    );
    expect(result).toBeNull();
  });

  it('should return null on invalid JSON response', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'not valid json' }],
          },
        },
      ],
    });

    const result = await suggestPolicyScope(
      execDetails,
      'run_shell_command',
      mockConfig,
    );
    expect(result).toBeNull();
    expect(logPolicySuggestion).toHaveBeenCalled();
  });

  it('should strip unsafe argsPattern but keep other fields', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  description: 'Allow git commands',
                  commandPrefix: ['git'],
                  argsPattern: '(a+)+', // ReDoS pattern
                }),
              },
            ],
          },
        },
      ],
    });

    const result = await suggestPolicyScope(
      execDetails,
      'run_shell_command',
      mockConfig,
    );

    expect(result).toEqual({
      description: 'Allow git commands',
      commandPrefix: ['git'],
    });
    // argsPattern should be stripped
    expect(result?.argsPattern).toBeUndefined();
  });

  it('should keep safe argsPattern', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  description: 'Allow npm test commands',
                  argsPattern: '^npm\\s+test',
                }),
              },
            ],
          },
        },
      ],
    });

    const result = await suggestPolicyScope(
      execDetails,
      'run_shell_command',
      mockConfig,
    );

    expect(result).toEqual({
      description: 'Allow npm test commands',
      argsPattern: '^npm\\s+test',
    });
  });
});
