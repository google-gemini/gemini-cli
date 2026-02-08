/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runRalphWiggum } from './ralphWiggum.js';
import * as nonInteractiveCli from './nonInteractiveCli.js';
import fs from 'node:fs';
import type { Config, ResumedSessionData } from '@google/gemini-cli-core';
import type { LoadedSettings } from './config/settings.js';

// Mock dependencies
vi.mock('node:fs');
vi.mock('./nonInteractiveCli.js');

describe('runRalphWiggum', () => {
  const mockConfig = {} as unknown as Config;
  const mockSettings = {} as unknown as LoadedSettings;
  const mockInput = 'Fix bugs';
  const mockPromptId = 'prompt-123';
  const mockResumedSessionData = {
    conversation: { messages: [], sessionId: 'session-123' },
    filePath: 'session.json',
  } as unknown as ResumedSessionData;

  beforeEach(() => {
    vi.resetAllMocks();
    // Default mock implementation for fs
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.readFileSync).mockReturnValue('');
  });

  it('should preserve resumedSessionData in second iteration', async () => {
    // Setup runNonInteractive to return "Failed" first, then "Success"
    const runNonInteractiveMock = vi.mocked(
      nonInteractiveCli.runNonInteractive,
    );
    runNonInteractiveMock
      .mockResolvedValueOnce('Test failed')
      .mockResolvedValueOnce('Test Success');

    await runRalphWiggum({
      config: mockConfig,
      settings: mockSettings,
      input: mockInput,
      prompt_id: mockPromptId,
      resumedSessionData: mockResumedSessionData,
      completionPromise: 'Success',
      maxIterations: 2,
    });

    expect(runNonInteractiveMock).toHaveBeenCalledTimes(2);

    // First call should have resumedSessionData
    expect(runNonInteractiveMock.mock.calls[0][0].resumedSessionData).toBe(
      mockResumedSessionData,
    );

    // Second call should have resumedSessionData (FIXED)
    expect(runNonInteractiveMock.mock.calls[1][0].resumedSessionData).toBe(
      mockResumedSessionData,
    );
  });
});
