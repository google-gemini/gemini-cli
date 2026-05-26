/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
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

  afterEach(() => {
    vi.restoreAllMocks();
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

    // Start simulator to initialize isRunning and subscribers, but clear interval immediately
    simulator.start();
    if (simulator['timer']) clearInterval(simulator['timer']);

    // Directly run the private tick method synchronously
    await simulator['tick']();

    expect(mockContentGenerator.generateContent).toHaveBeenCalled();
    const lastCall = mockContentGenerator.generateContent.mock.calls[0];
    const prompt = lastCall[0].contents[0].parts[0].text;

    expect(prompt).toContain(
      'STATE 2: The agent is waiting for you to authorize a tool',
    );
    expect(prompt).toContain('[Y/n]');
    expect(prompt).toContain('RULE 1: If there is a clear confirmation prompt');

    simulator.stop();
  });

  it('should not wait if a prompt is visible even if a spinner is present', async () => {
    const simulator = new UserSimulator(
      mockConfig,
      mockGetScreen,
      mockStdinBuffer,
    );

    // Mock a screen with a spinner and a prompt
    mockGetScreen.mockReturnValue('⠋ Working...\n> Type your message');

    simulator.start();
    if (simulator['timer']) clearInterval(simulator['timer']);

    await simulator['tick']();

    expect(mockContentGenerator.generateContent).toHaveBeenCalled();
    const lastCall = mockContentGenerator.generateContent.mock.calls[0];
    const prompt = lastCall[0].contents[0].parts[0].text;

    expect(prompt).toContain(
      'Only <WAIT> (Rule 1 fallback) if the agent is truly mid-process',
    );

    simulator.stop();
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

    simulator.start();
    if (simulator['timer']) clearInterval(simulator['timer']);

    await simulator['tick']();

    expect(mockStdinBuffer.write).toHaveBeenCalledWith('a');
    expect(mockStdinBuffer.write).toHaveBeenCalledWith('b');
    expect(mockStdinBuffer.write).toHaveBeenCalledWith('c');

    simulator.stop();
  });

  it('should inject internal tool state into the prompt', async () => {
    const simulator = new UserSimulator(
      mockConfig,
      mockGetScreen,
      mockStdinBuffer,
    );
    mockGetScreen.mockReturnValue('Responding...');

    simulator.start();
    if (simulator['timer']) clearInterval(simulator['timer']);

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

    await simulator['tick']();

    expect(mockContentGenerator.generateContent).toHaveBeenCalled();
    const lastCall = mockContentGenerator.generateContent.mock.calls[0];
    const prompt = lastCall[0].contents[0].parts[0].text;

    expect(prompt).toContain(
      'INTERNAL SYSTEM STATE: The system is currently BLOCKED',
    );
    expect(prompt).toContain('test_tool');
    expect(prompt).toContain("Ignore any 'Responding' indicators");

    simulator.stop();
  });

  it('should terminate if terminal state does not change after 10 consecutive inputs', async () => {
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

    simulator.start();
    if (simulator['timer']) clearInterval(simulator['timer']);

    // Run 10 ticks manually. All of them fall through to generateContent.
    for (let i = 0; i < 10; i++) {
      await simulator['tick']();
    }
    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(10);

    // Run the 11th tick, which should trigger stall termination
    await simulator['tick']();

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    simulator.stop();
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

    simulator.start();
    if (simulator['timer']) clearInterval(simulator['timer']);

    // First tick: captures note
    await simulator['tick']();
    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(1);

    // Second tick: different screen
    mockGetScreen.mockReturnValue('> Prompt 2');
    mockContentGenerator.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ action: 'pwd\r' }),
    });
    await simulator['tick']();

    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(2);
    const secondCall = mockContentGenerator.generateContent.mock.calls[1];
    const prompt = secondCall[0].contents[0].parts[0].text;

    expect(prompt).toContain(
      "Your Session Memory (Key facts you've recorded):",
    );
    expect(prompt).toContain('1. I listed the directory contents.');

    simulator.stop();
  });

  it('should trigger background compression when memory exceeds threshold and merge correctly', async () => {
    const simulator = new UserSimulator(
      mockConfig,
      mockGetScreen,
      mockStdinBuffer,
    );

    simulator.start();
    if (simulator['timer']) clearInterval(simulator['timer']);

    for (let i = 0; i < 5; i++) {
      mockGetScreen.mockReturnValue(`> Prompt ${i}`);
      mockContentGenerator.generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          action: 'wait\r',
          session_notes: `Note ${i}`,
        }),
      });
      await simulator['tick']();
    }

    expect(mockContentGenerator.generateContent).toHaveBeenCalledTimes(5);

    // Resolve the compression call
    mockContentGenerator.generateContent.mockImplementation(async (req, id) => {
      if (id === 'simulator-compression') {
        return { text: 'Compressed Summary' };
      }
      return { text: JSON.stringify({ action: 'y\r' }) };
    });

    // Wait for the background task to complete using Vitest waitFor
    await vi.waitFor(() => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
      const memory = (simulator as any).sessionMemory as string[];
      return memory.length > 0 && memory[0] === 'Compressed Summary';
    });

    // Trigger one more tick to see if the compressed memory is used
    mockGetScreen.mockReturnValue('> Final Prompt');
    await simulator['tick']();

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
  });
});
