/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { UserSimulator } from './UserSimulator.js';
import { Writable } from 'node:stream';
import {
  type Config,
  MessageBusType,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';

describe('UserSimulator', () => {
  let mockConfig: Config;
  let mockGetScreen: Mock<() => string | undefined>;
  let mockStdinBuffer: Writable;
  let mockContentGenerator: {
    generateContent: Mock;
  };
  let mockMessageBus: {
    subscribe: Mock;
    unsubscribe: Mock;
  };

  beforeEach(() => {
    mockContentGenerator = {
      generateContent: vi
        .fn()
        .mockResolvedValue({ text: JSON.stringify({ action: 'y\r' }) }),
    };

    mockMessageBus = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    mockConfig = {
      getContentGenerator: () => mockContentGenerator,
      getSimulateUser: () => true,
      getQuestion: () => 'test goal',
      getKnowledgeSource: () => undefined,
      getHasAccessToPreviewModel: () => true,
      getMessageBus: () => mockMessageBus,
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
    // Initial delay 100ms + (3 chars * 10ms) + 100ms settle = 230ms minimum
    await vi.advanceTimersByTimeAsync(500);

    expect(mockStdinBuffer.write).toHaveBeenCalledWith('a');
    expect(mockStdinBuffer.write).toHaveBeenCalledWith('b');
    expect(mockStdinBuffer.write).toHaveBeenCalledWith('c');

    simulator.stop();
    vi.useRealTimers();
  });

  it('should inject internal tool state into the prompt', async () => {
    const simulator = new UserSimulator(
      mockConfig,
      mockGetScreen,
      mockStdinBuffer,
    );
    mockGetScreen.mockReturnValue('Responding...');

    vi.useFakeTimers();
    simulator.start();

    // Verify subscription
    expect(mockMessageBus.subscribe).toHaveBeenCalledWith(
      MessageBusType.TOOL_CALLS_UPDATE,
      expect.any(Function),
    );

    // Simulate tool call update
    const handler = mockMessageBus.subscribe.mock.calls[0][1];
    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [
        {
          status: CoreToolCallStatus.AwaitingApproval,
          request: { name: 'test_tool' },
        },
      ],
    });

    // Trigger tick
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockContentGenerator.generateContent).toHaveBeenCalled();
    const lastCall = mockContentGenerator.generateContent.mock.calls[0];
    const prompt = lastCall[0].contents[0].parts[0].text;

    expect(prompt).toContain(
      'INTERNAL SYSTEM STATE: The system is currently BLOCKED',
    );
    expect(prompt).toContain('test_tool');
    expect(prompt).toContain("Ignore any 'Responding' indicators");

    simulator.stop();
    expect(mockMessageBus.unsubscribe).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should terminate if terminal state does not change after 3 consecutive inputs', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      return undefined as never;
    });
    const simulator = new UserSimulator(
      mockConfig,
      mockGetScreen,
      mockStdinBuffer,
    );
    mockGetScreen.mockReturnValue('Static Screen');
    mockContentGenerator.generateContent.mockResolvedValue({
      text: JSON.stringify({ action: 'y\r' }),
    });

    vi.useFakeTimers();
    simulator.start();

    // Tick 1: Action sent, state recorded
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(1);

    // Tick 2: Same screen, action sent, stall count = 1
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(2);

    // Tick 3: Same screen, action sent, stall count = 2
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(3);

    // Tick 4: Same screen, should trigger termination
    await vi.advanceTimersByTimeAsync(2000);

    expect(exitSpy).toHaveBeenCalledWith(1);

    simulator.stop();
    exitSpy.mockRestore();
    vi.useRealTimers();
  });

  it('should capture session notes and inject them into subsequent prompts', async () => {
    const simulator = new UserSimulator(
      mockConfig,
      mockGetScreen,
      mockStdinBuffer,
    );
    mockGetScreen.mockReturnValue('> Prompt 1');
    mockContentGenerator.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        action: 'ls\r',
        session_notes: 'I listed the directory contents.',
      }),
    });

    vi.useFakeTimers();
    simulator.start();

    // First tick: captures note
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(1);

    // Second tick: different screen to avoid skip
    mockGetScreen.mockReturnValue('> Prompt 2');
    mockContentGenerator.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ action: 'pwd\r' }),
    });
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(2);
    const secondCall = mockContentGenerator.generateContent.mock.calls[1];
    const prompt = secondCall[0].contents[0].parts[0].text;

    expect(prompt).toContain(
      "Your Session Memory (Key facts you've recorded):",
    );
    expect(prompt).toContain('1. I listed the directory contents.');

    simulator.stop();
    vi.useRealTimers();
  });

  it('should trigger background compression when memory exceeds threshold and merge correctly', async () => {
    const simulator = new UserSimulator(
      mockConfig,
      mockGetScreen,
      mockStdinBuffer,
    );

    // Provide 4 existing notes
    // We can't set private sessionMemory directly easily without casting or refactoring
    // So we'll trigger 5 ticks that each return a note.
    vi.useFakeTimers();
    simulator.start();

    for (let i = 0; i < 5; i++) {
      mockGetScreen.mockReturnValue(`> Prompt ${i}`);
      mockContentGenerator.generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          action: 'wait\r',
          session_notes: `Note ${i}`,
        }),
      });
      await vi.advanceTimersByTimeAsync(2000);
    }

    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(5);

    // The 5th tick should have triggered compression.
    // Let's mock the compression response.
    // The compression call uses 'simulator-compression' as prompt ID.
    const compressionCall =
      mockContentGenerator.generateContent.mock.calls.find(
        (call) => call[1] === 'simulator-compression',
      );
    expect(compressionCall).toBeDefined();
    if (compressionCall) {
      expect(compressionCall[0].contents[0].parts[0].text).toContain(
        'Summarize the following chronological session notes',
      );
    }

    // Wait for the compression to finish and merge.
    // We need to resolve the promise for the compression call.
    // In our mock, it resolves to { action: 'y\r' } by default from beforeEach.
    // Let's make it return a specific summary.
    mockContentGenerator.generateContent.mockImplementation(async (req, id) => {
      if (id === 'simulator-compression') {
        return { text: 'Compressed Summary' };
      }
      return { text: JSON.stringify({ action: 'y\r' }) };
    });

    // Advance time to allow the background task to complete
    await vi.advanceTimersByTimeAsync(1000);

    // Trigger one more tick to see if the compressed memory is used
    mockGetScreen.mockReturnValue('> Final Prompt');
    await vi.advanceTimersByTimeAsync(2000);

    const finalCall = mockContentGenerator.generateContent.mock.calls.find(
      (call) =>
        call[0].contents[0].parts[0].text.includes('> Final Prompt') &&
        call[1] === 'simulator-prompt',
    );

    expect(finalCall).toBeDefined();
    if (finalCall) {
      const finalPrompt = finalCall[0].contents[0].parts[0].text;
      expect(finalPrompt).toContain('1. Compressed Summary');
    }

    simulator.stop();
    vi.useRealTimers();
  });
});
