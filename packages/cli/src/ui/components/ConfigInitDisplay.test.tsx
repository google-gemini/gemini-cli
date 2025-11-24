/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { ConfigInitDisplay } from './ConfigInitDisplay.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppEvent } from '../../utils/events.js';
import { MCPServerStatus, type McpClient } from '@google/gemini-cli-core';
import { Text } from 'ink';

// Mock GeminiSpinner
vi.mock('./GeminiRespondingSpinner.js', () => ({
  GeminiSpinner: () => <Text>Spinner</Text>,
}));

// Mock appEvents
const { mockOn, mockOff, mockEmit } = vi.hoisted(() => ({
  mockOn: vi.fn(),
  mockOff: vi.fn(),
  mockEmit: vi.fn(),
}));

vi.mock('../../utils/events.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/events.js')>();
  return {
    ...actual,
    appEvents: {
      on: mockOn,
      off: mockOff,
      emit: mockEmit,
    },
  };
});

describe('ConfigInitDisplay', () => {
  beforeEach(() => {
    mockOn.mockClear();
    mockOff.mockClear();
    mockEmit.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders initial state', () => {
    const { lastFrame } = render(<ConfigInitDisplay />);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('updates message on McpClientUpdate event', async () => {
    let listener: ((clients?: Map<string, McpClient>) => void) | undefined;
    mockOn.mockImplementation((event, fn) => {
      if (event === AppEvent.McpClientUpdate) {
        listener = fn;
      }
    });

    const { lastFrame } = render(<ConfigInitDisplay />);

    // Wait for listener to be registered
    await vi.waitFor(() => {
      if (!listener) throw new Error('Listener not registered yet');
    });

    const mockClient1 = {
      getStatus: () => MCPServerStatus.CONNECTED,
    } as McpClient;
    const mockClient2 = {
      getStatus: () => MCPServerStatus.CONNECTING,
    } as McpClient;
    const clients = new Map<string, McpClient>([
      ['server1', mockClient1],
      ['server2', mockClient2],
    ]);

    // Trigger the listener manually since we mocked the event emitter
    act(() => {
      listener!(clients);
    });

    // Wait for the UI to update
    await vi.waitFor(() => {
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  it('handles empty clients map', async () => {
    let listener: ((clients?: Map<string, McpClient>) => void) | undefined;
    mockOn.mockImplementation((event, fn) => {
      if (event === AppEvent.McpClientUpdate) {
        listener = fn;
      }
    });

    const { lastFrame } = render(<ConfigInitDisplay />);

    await vi.waitFor(() => {
      if (!listener) throw new Error('Listener not registered yet');
    });

    if (listener) {
      const safeListener = listener;
      act(() => {
        safeListener(new Map());
      });
    }

    await vi.waitFor(() => {
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
