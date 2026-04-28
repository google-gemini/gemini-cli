/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserSimulator } from './UserSimulator.js';
import { Writable } from 'node:stream';
import type { Config } from '@google/gemini-cli-core';

describe('UserSimulator', () => {
  let mockConfig: Config;
  let mockGetScreen: vi.Mock<() => string | undefined>;
  let mockStdinBuffer: Writable;
  let mockContentGenerator: {
    generateContent: vi.Mock;
  };

  beforeEach(() => {
    mockContentGenerator = {
      generateContent: vi
        .fn()
        .mockResolvedValue({ text: JSON.stringify({ action: 'y\r' }) }),
    };

    mockConfig = {
      getContentGenerator: () => mockContentGenerator,
      getSimulateUser: () => true,
      getQuestion: () => 'test goal',
      getKnowledgeSource: () => undefined,
      getHasAccessToPreviewModel: () => true,
    } as unknown as Config;

    mockGetScreen = vi.fn();
    mockStdinBuffer = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });
    vi.spyOn(mockStdinBuffer, 'write');
  });

  it('should include interactive prompts in its vision even when timers are present', async () => {
    const simulator = new UserSimulator(
      mockConfig,
      mockGetScreen,
      mockStdinBuffer,
    );

    // Mock a screen with a timer and a confirmation prompt
    mockGetScreen.mockReturnValue(
      'Thinking... (0s)\n\nAction Required: Allow pip execution? [Y/n]',
    );

    // We need to trigger the private tick method. Since it's private and run on an interval,
    // we can use a hack or just test the prompt construction if we refactor,
    // but for now let's use the interval.

    vi.useFakeTimers();
    simulator.start();

    // Trigger the interval
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockContentGenerator.generateContent).toHaveBeenCalled();
    const lastCall = mockContentGenerator.generateContent.mock.calls[0];
    const prompt = lastCall[0].contents[0].parts[0].text;

    expect(prompt).toContain(
      'STATE 2: The agent is waiting for you to authorize a tool',
    );
    expect(prompt).toContain('[Y/n]');
    expect(prompt).toContain('RULE 1: If there is a clear confirmation prompt');

    simulator.stop();
    vi.useRealTimers();
  });

  it('should not wait if a prompt is visible even if a spinner is present', async () => {
    const simulator = new UserSimulator(
      mockConfig,
      mockGetScreen,
      mockStdinBuffer,
    );

    // Mock a screen with a spinner and a prompt
    mockGetScreen.mockReturnValue('⠋ Working...\n> Type your message');

    vi.useFakeTimers();
    simulator.start();

    await vi.advanceTimersByTimeAsync(2000);

    expect(mockContentGenerator.generateContent).toHaveBeenCalled();
    const lastCall = mockContentGenerator.generateContent.mock.calls[0];
    const prompt = lastCall[0].contents[0].parts[0].text;

    expect(prompt).toContain(
      'Only <WAIT> (Rule 1 fallback) if the agent is truly mid-process',
    );

    simulator.stop();
    vi.useRealTimers();
  });

  it('should submit keys with reliable delays', async () => {
    const simulator = new UserSimulator(
      mockConfig,
      mockGetScreen,
      mockStdinBuffer,
    );
    mockGetScreen.mockReturnValue('> Prompt');
    mockContentGenerator.generateContent.mockResolvedValue({
      text: JSON.stringify({ action: 'abc' }),
    });

    vi.useFakeTimers();
    simulator.start();

    // Trigger tick
    await vi.advanceTimersByTimeAsync(2000);

    // Wait for the async key submission loop to finish
    // Initial delay 100ms + (3 chars * 10ms) = 130ms minimum
    await vi.advanceTimersByTimeAsync(500);

    expect(mockStdinBuffer.write).toHaveBeenCalledWith('a');
    expect(mockStdinBuffer.write).toHaveBeenCalledWith('b');
    expect(mockStdinBuffer.write).toHaveBeenCalledWith('c');

    simulator.stop();
    vi.useRealTimers();
  });
});
