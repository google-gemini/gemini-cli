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
    const expectedUrl =
      'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title=A%20test%20bug&info=' +
      encodeURIComponent(expectedInfo);

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
});
