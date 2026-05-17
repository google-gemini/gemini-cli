/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { GeminiChat } from './geminiChat.js';
import type { Config } from '../config/config.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';

describe('GeminiChat Edge Case', () => {
  it('should not drop model turns with empty text and functionCall when getHistory(true) is called', () => {
    const mockConfig = {
      isContextManagementEnabled: () => false,
      getProjectRoot: () => '/fake/root',
      getSessionId: () => 'fake-session',
      getContextManagementConfig: () => ({ enabled: false }),
    } as unknown as Config;

    const mockContext = {
      config: mockConfig,
      promptId: 'fake-prompt-id',
      messageBus: {
        emit: () => {},
      },
    } as unknown as AgentLoopContext;

    const chat = new GeminiChat(mockContext);
    chat['chatRecordingService'].updateMessagesFromHistory = () => {};

    chat.setHistory([
      { role: 'user', parts: [{ text: 'Do something' }] },
      {
        role: 'model',
        parts: [
          { text: '' }, // empty text!
          { functionCall: { name: 'myTool', args: {} } },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: { name: 'myTool', response: { result: 'done' } },
          },
        ],
      },
    ]);

    const curatedHistory = chat.getHistory(true);

    // The model turn should NOT be dropped now!
    expect(curatedHistory.length).toBe(3);
    expect(curatedHistory[0].role).toBe('user');
    expect(curatedHistory[1].role).toBe('model');
    expect(curatedHistory[2].role).toBe('user');
  });
});
