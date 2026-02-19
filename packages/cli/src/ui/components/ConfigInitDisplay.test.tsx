/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import type { EventEmitter } from 'node:events';
import { render } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { ConfigInitDisplay } from './ConfigInitDisplay.js';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import {
  CoreEvent,
  MCPServerStatus,
  type McpClient,
  coreEvents,
} from '@google/gemini-cli-core';
import { Text } from 'ink';

// Mock GeminiSpinner
vi.mock('./GeminiRespondingSpinner.js', () => ({
  GeminiSpinner: () => <Text>Spinner</Text>,
}));

describe('ConfigInitDisplay', () => {
  let onSpy: MockInstance<EventEmitter['on']>;

  beforeEach(() => {
    onSpy = vi.spyOn(coreEvents as EventEmitter, 'on');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders initial state', async () => {
    const { lastFrame, waitUntilReady } = render(<ConfigInitDisplay />);
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('updates message on McpClientUpdate event', async () => {
    let listener: ((clients?: Map<string, McpClient>) => void) | undefined;
    onSpy.mockImplementation((event: unknown, fn: unknown) => {
      if (event === CoreEvent.McpClientUpdate) {
        listener = fn as (clients?: Map<string, McpClient>) => void;
      }
      return coreEvents;
    });

    const { lastFrame } = render(<ConfigInitDisplay />);

    // Wait for listener to be registered
    await waitFor(() => {
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
    await waitFor(() => {
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  it('truncates list of waiting servers if too many', async () => {
    let listener: ((clients?: Map<string, McpClient>) => void) | undefined;
    onSpy.mockImplementation((event: unknown, fn: unknown) => {
      if (event === CoreEvent.McpClientUpdate) {
        listener = fn as (clients?: Map<string, McpClient>) => void;
      }
      return coreEvents;
    });

    const { lastFrame } = render(<ConfigInitDisplay />);

    await waitFor(() => {
      if (!listener) throw new Error('Listener not registered yet');
    });

    const mockClientConnecting = {
      getStatus: () => MCPServerStatus.CONNECTING,
    } as McpClient;

    const clients = new Map<string, McpClient>([
      ['s1', mockClientConnecting],
      ['s2', mockClientConnecting],
      ['s3', mockClientConnecting],
      ['s4', mockClientConnecting],
      ['s5', mockClientConnecting],
    ]);

    act(() => {
      listener!(clients);
    });

    await waitFor(() => {
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  it('handles empty clients map', async () => {
    let listener: ((clients?: Map<string, McpClient>) => void) | undefined;
    onSpy.mockImplementation((event: unknown, fn: unknown) => {
      if (event === CoreEvent.McpClientUpdate) {
        listener = fn as (clients?: Map<string, McpClient>) => void;
      }
      return coreEvents;
    });

    const { lastFrame } = render(<ConfigInitDisplay />);

    await waitFor(() => {
      if (!listener) throw new Error('Listener not registered yet');
    });

    if (listener) {
      const safeListener = listener;
      act(() => {
        safeListener(new Map());
      });
    }

    await waitFor(() => {
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
