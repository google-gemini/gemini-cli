/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WatcherAgent } from './watcher-agent.js';
import { makeFakeConfig } from '../test-utils/config.js';
import * as path from 'node:path';

describe('WatcherAgent', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_SYSTEM_MD', '');
    vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should create a valid watcher agent definition', () => {
    const config = makeFakeConfig();
    const projectTempDir = '/tmp/project';
    vi.spyOn(config.storage, 'getProjectTempDir').mockReturnValue(
      projectTempDir,
    );

    Object.defineProperty(config, 'config', {
      get() {
        return this;
      },
    });

    const agent = WatcherAgent(config);

    expect(agent.name).toBe('watcher');
    expect(agent.kind).toBe('local');
    expect(agent.description).toContain('monitors the progress');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((agent.inputConfig.inputSchema as any).properties).toHaveProperty(
      'recentHistory',
    );
    expect(agent.outputConfig?.outputName).toBe('report');

    const statusFilePath = path.join(projectTempDir, 'watcher_status.md');
    expect(agent.promptConfig.systemPrompt).toContain(statusFilePath);
    expect(agent.promptConfig.query).toContain(statusFilePath);
  });
});
