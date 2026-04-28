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

  it('should re-evaluate if internal tool state changes even if screen content is static', async () => {
    const simulator = new UserSimulator(
      mockConfig,
      mockGetScreen,
      mockStdinBuffer,
    );
    mockGetScreen.mockReturnValue('Responding...');

    vi.useFakeTimers();
    simulator.start();

    // Trigger first tick
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(1);

    // Trigger second tick with same screen - should skip
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(1);

    // Simulate tool call update
    const handler = mockMessageBus.subscribe.mock.calls[0][1];
    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [
        {
          status: CoreToolCallStatus.AwaitingApproval,
          request: { callId: '123', name: 'test_tool' },
        },
      ],
    });

    // Trigger third tick with same screen but new tool state - should NOT skip
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(2);

    simulator.stop();
    vi.useRealTimers();
  });
});
