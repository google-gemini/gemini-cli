/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import open from 'open';
import { bugCommand } from './bugCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { getCliVersion } from '../../utils/version.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';
import { formatMemoryUsage } from '../utils/formatters.js';
import { HistoryItem, ToolCallStatus } from '../types.js';

// Mock dependencies
vi.mock('open');
vi.mock('../../utils/version.js');

vi.mock('../utils/formatters.js');
vi.mock('node:process', () => ({
  default: {
    platform: 'test-platform',
    version: 'v20.0.0',
    // Keep other necessary process properties if needed by other parts of the code
    env: process.env,
    memoryUsage: () => ({ rss: 0 }),
  },
}));

describe('bugCommand', () => {
  beforeEach(() => {
    vi.mocked(getCliVersion).mockResolvedValue('0.1.0');
    vi.mocked(formatMemoryUsage).mockReturnValue('100 MB');
    vi.stubEnv('SANDBOX', 'gemini-test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('should generate the default GitHub issue URL', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getModel: () => 'gemini-pro',
          getBugCommand: () => undefined,
        },
      },
      ui: {
        history: [],
      },
    });

    if (!bugCommand.action) throw new Error('Action is not defined');
    await bugCommand.action(mockContext, 'A test bug');

    const expectedInfo = `
* **CLI Version:** 0.1.0
* **Git Commit:** ${GIT_COMMIT_INFO}
* **Operating System:** test-platform v20.0.0
* **Sandbox Environment:** test
* **Model Version:** gemini-pro
* **Memory Usage:** 100 MB
`;
    const problem = [
      '**Last User Prompt**',
      '```',
      'N/A',
      '```',
      '',
      '**Last Gemini CLI Response**',
      '```',
      'N/A',
      '```',
    ].join('\n');

    let expectedUrl =
      'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}&problem={problem}';
    expectedUrl = expectedUrl
      .replace('{title}', encodeURIComponent('A test bug'))
      .replace('{info}', encodeURIComponent(expectedInfo))
      .replace('{problem}', encodeURIComponent(problem));

    expect(open).toHaveBeenCalledWith(expectedUrl);
  });

  it('should use a custom URL template from config if provided', async () => {
    const customTemplate =
      'https://internal.bug-tracker.com/new?desc={title}&details={info}';
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getModel: () => 'gemini-pro',
          getBugCommand: () => ({ urlTemplate: customTemplate }),
        },
      },
      ui: {
        history: [],
      },
    });

    if (!bugCommand.action) throw new Error('Action is not defined');
    await bugCommand.action(mockContext, 'A custom bug');

    const expectedInfo = `
* **CLI Version:** 0.1.0
* **Git Commit:** ${GIT_COMMIT_INFO}
* **Operating System:** test-platform v20.0.0
* **Sandbox Environment:** test
* **Model Version:** gemini-pro
* **Memory Usage:** 100 MB
`;
    const expectedUrl = customTemplate
      .replace('{title}', encodeURIComponent('A custom bug'))
      .replace('{info}', encodeURIComponent(expectedInfo));

    expect(open).toHaveBeenCalledWith(expectedUrl);
  });

  it('should correctly format multi-line prompts and responses', async () => {
    const multiLinePrompt = `First line of prompt.
Second line of prompt.`;
    const multiLineResponse = `First line of response.
Second line of response.`;

    const mockContext = createMockCommandContext({
      services: {
        config: {
          getModel: () => 'gemini-pro',
          getBugCommand: () => undefined,
        },
      },
      ui: {
        history: [
          { type: 'user', text: multiLinePrompt, id: 1 },
          { type: 'gemini', text: multiLineResponse, id: 2 },
          { type: 'user', text: '/bug', id: 3 },
        ],
      },
    });

    if (!bugCommand.action) throw new Error('Action is not defined');
    await bugCommand.action(mockContext, 'A multi-line bug');

    const expectedInfo = `
* **CLI Version:** 0.1.0
* **Git Commit:** ${GIT_COMMIT_INFO}
* **Operating System:** test-platform v20.0.0
* **Sandbox Environment:** test
* **Model Version:** gemini-pro
* **Memory Usage:** 100 MB
`;

    const expectedProblem = [
      '**Last User Prompt**',
      '```',
      multiLinePrompt,
      '```',
      '',
      '**Last Gemini CLI Response**',
      '```',
      `✦ ${multiLineResponse}`,
      '```',
    ].join('\n');

    let expectedUrl =
      'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}&problem={problem}';
    expectedUrl = expectedUrl
      .replace('{title}', encodeURIComponent('A multi-line bug'))
      .replace('{info}', encodeURIComponent(expectedInfo))
      .replace('{problem}', encodeURIComponent(expectedProblem));

    expect(open).toHaveBeenCalledWith(expectedUrl);
  });

  it('should concatenate multiple Gemini responses since the last user prompt', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getModel: () => 'gemini-pro',
          getBugCommand: () => undefined,
        },
      },
      ui: {
        history: [
          { type: 'user', text: 'show me my files', id: 1 },
          { type: 'gemini', text: 'Okay, which files?', id: 2 },
          {
            type: 'tool_group',
            tools: [
              {
                name: 'list_files',
                status: ToolCallStatus.Success,
                callId: '1',
                description: '',
                resultDisplay: undefined,
                confirmationDetails: undefined,
              },
            ],
            id: 3,
          },
          { type: 'gemini', text: 'I have listed the files.', id: 4 },
          { type: 'user', text: '/bug A complex bug', id: 5 },
        ] as HistoryItem[],
      },
    });

    if (!bugCommand.action) throw new Error('Action is not defined');
    await bugCommand.action(mockContext, 'A complex bug');

    const expectedInfo = `
* **CLI Version:** 0.1.0
* **Git Commit:** ${GIT_COMMIT_INFO}
* **Operating System:** test-platform v20.0.0
* **Sandbox Environment:** test
* **Model Version:** gemini-pro
* **Memory Usage:** 100 MB
`;

    const expectedProblem = [
      '**Last User Prompt**',
      '```',
      'show me my files',
      '```',
      '',
      '**Last Gemini CLI Response**',
      '```',
      [
        `✦ Okay, which files?`,
        `Tool Call: list_files, Status: Success, Description: N/A`,
        `✦ I have listed the files.`,
      ].join('\n---\n'),
      '```',
    ].join('\n');

    let expectedUrl =
      'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}&problem={problem}';
    expectedUrl = expectedUrl
      .replace('{title}', encodeURIComponent('A complex bug'))
      .replace('{info}', encodeURIComponent(expectedInfo))
      .replace('{problem}', encodeURIComponent(expectedProblem));

    expect(open).toHaveBeenCalledWith(expectedUrl);
  });

  it('should truncate the URL and add a message if it exceeds 8000 characters', async () => {
    const longText = 'a'.repeat(8000);
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getModel: () => 'gemini-pro',
          getBugCommand: () => undefined,
        },
      },
      ui: {
        history: [
          { type: 'user', text: 'show me my files', id: 1 },
          { type: 'gemini', text: longText, id: 2 },
          { type: 'gemini', text: 'some more text', id: 3 },
          { type: 'user', text: '/bug A long bug', id: 4 },
        ] as HistoryItem[],
      },
    });

    if (!bugCommand.action) throw new Error('Action is not defined');
    await bugCommand.action(mockContext, 'A long bug');

    const expectedInfo = `
* **CLI Version:** 0.1.0
* **Git Commit:** ${GIT_COMMIT_INFO}
* **Operating System:** test-platform v20.0.0
* **Sandbox Environment:** test
* **Model Version:** gemini-pro
* **Memory Usage:** 100 MB
`;

    const expectedProblem = [
      '**Last User Prompt**',
      '```',
      'show me my files',
      '```',
      '',
      '**Last Gemini CLI Response**',
      '```',
      `... truncated response due to character limit ...
✦ some more text`,
      '```',
    ].join('\n');

    let expectedUrl =
      'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}&problem={problem}';
    expectedUrl = expectedUrl
      .replace('{title}', encodeURIComponent('A long bug'))
      .replace('{info}', encodeURIComponent(expectedInfo))
      .replace('{problem}', encodeURIComponent(expectedProblem));

    expect(open).toHaveBeenCalledWith(expectedUrl);
    expect(expectedUrl.length).toBeLessThan(8000);
  });
});
