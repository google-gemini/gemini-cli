/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const mockSendMessage = vi.hoisted(() => vi.fn());
const mockUUID = 'd8ea048c-a612-4318-abec-1f237207b8e6';

vi.mock('node:crypto', () => ({
  randomUUID: () => mockUUID,
}));

vi.mock('../a2a/client.js', () => ({
  A2AClient: vi.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
  })),
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { A2ATool } from './a2a-tool.js';
import { Task } from '../a2a/types.js';

describe('A2ATool', () => {
  let tool: A2ATool;

  beforeEach(() => {
    // Reset mocks before each test
    mockSendMessage.mockClear();
    tool = new A2ATool();
  });

  it('should call the A2A client and format the response', async () => {
    const mockResponse: Task = {
      kind: 'task',
      id: 'task-123',
      contextId: 'context-456',
      status: {
        state: 'completed',
      },
    };
    mockSendMessage.mockResolvedValue(mockResponse);

    const result = await tool.execute({
      url: 'http://localhost:8888',
      message: 'Hello, agent!',
    });

    // Verify that sendMessage was called with the correct payload.
    expect(mockSendMessage).toHaveBeenCalledWith({
      message: {
        messageId: mockUUID,
        role: 'user',
        parts: [{ kind: 'text', text: 'Hello, agent!' }],
      },
    });

    // Check that the tool returns the formatted response.
    expect(result.llmContent).toContain('Task ID: task-123');
    expect(result.llmContent).toContain('Status: completed');
  });
});
