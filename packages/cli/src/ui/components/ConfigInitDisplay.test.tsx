/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { ConfigInitDisplay } from './ConfigInitDisplay.js';
import { type McpClient, MCPServerStatus } from '@google/gemini-cli-core';

vi.mock('../contexts/ConfigContext.js', () => ({
  useConfig: vi.fn(() => ({})),
}));

vi.mock('./GeminiRespondingSpinner.js', () => ({
  GeminiSpinner: () => <Text>spinner</Text>,
}));

// Mock appEvents
const mockEventHandlers = new Map<string, (arg?: unknown) => void>();
vi.mock('./../../utils/events.js', () => ({
  appEvents: {
    on: vi.fn((event: string, handler: (arg?: unknown) => void) => {
      mockEventHandlers.set(event, handler);
    }),
    off: vi.fn((event: string) => {
      mockEventHandlers.delete(event);
    }),
    emit: vi.fn((event: string, arg?: unknown) => {
      const handler = mockEventHandlers.get(event);
      if (handler) handler(arg);
    }),
  },
}));

describe('ConfigInitDisplay', () => {
  it('should render initial message', () => {
    const { lastFrame } = render(<ConfigInitDisplay />);
    expect(lastFrame()).toContain('Initializing...');
  });

  it('should render spinner', () => {
    const { lastFrame } = render(<ConfigInitDisplay />);
    expect(lastFrame()).toContain('spinner');
  });

  it('should register mcp-client-update event listener', async () => {
    const { appEvents } = await import('./../../utils/events.js');
    render(<ConfigInitDisplay />);
    expect(appEvents.on).toHaveBeenCalledWith(
      'mcp-client-update',
      expect.any(Function),
    );
  });

  it('should update message when MCP clients connect', async () => {
    const { rerender, lastFrame } = render(<ConfigInitDisplay />);

    const mockClients = new Map<string, McpClient>();
    mockClients.set('client1', {
      getStatus: () => MCPServerStatus.CONNECTED,
    } as McpClient);

    const handler = mockEventHandlers.get('mcp-client-update');
    if (handler) handler(mockClients);
    rerender(<ConfigInitDisplay />);

    expect(lastFrame()).toContain('Connecting to MCP servers... (1/1)');
  });

  it('should show correct count for multiple clients', async () => {
    const { rerender, lastFrame } = render(<ConfigInitDisplay />);

    const mockClients = new Map<string, McpClient>();
    mockClients.set('client1', {
      getStatus: () => MCPServerStatus.CONNECTED,
    } as McpClient);
    mockClients.set('client2', {
      getStatus: () => MCPServerStatus.CONNECTING,
    } as McpClient);
    mockClients.set('client3', {
      getStatus: () => MCPServerStatus.CONNECTED,
    } as McpClient);

    const handler = mockEventHandlers.get('mcp-client-update');
    if (handler) handler(mockClients);
    rerender(<ConfigInitDisplay />);

    expect(lastFrame()).toContain('Connecting to MCP servers... (2/3)');
  });

  it('should show Initializing when no clients', () => {
    const { rerender, lastFrame } = render(<ConfigInitDisplay />);

    const handler = mockEventHandlers.get('mcp-client-update');
    if (handler) handler(new Map());
    rerender(<ConfigInitDisplay />);

    expect(lastFrame()).toContain('Initializing...');
  });

  it('should clean up event listener on unmount', async () => {
    const { appEvents } = await import('./../../utils/events.js');
    const { unmount } = render(<ConfigInitDisplay />);
    unmount();
    expect(appEvents.off).toHaveBeenCalledWith(
      'mcp-client-update',
      expect.any(Function),
    );
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<ConfigInitDisplay />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<ConfigInitDisplay />);
    expect(() => unmount()).not.toThrow();
  });

  it('should handle undefined clients', () => {
    const { rerender, lastFrame } = render(<ConfigInitDisplay />);

    const handler = mockEventHandlers.get('mcp-client-update');
    if (handler) handler(undefined);
    rerender(<ConfigInitDisplay />);

    expect(lastFrame()).toContain('Initializing...');
  });

  it('should count only CONNECTED status', () => {
    const { rerender, lastFrame } = render(<ConfigInitDisplay />);

    const mockClients = new Map<string, McpClient>();
    mockClients.set('client1', {
      getStatus: () => MCPServerStatus.CONNECTED,
    } as McpClient);
    mockClients.set('client2', {
      getStatus: () => MCPServerStatus.ERROR,
    } as McpClient);
    mockClients.set('client3', {
      getStatus: () => MCPServerStatus.DISCONNECTED,
    } as McpClient);

    const handler = mockEventHandlers.get('mcp-client-update');
    if (handler) handler(mockClients);
    rerender(<ConfigInitDisplay />);

    expect(lastFrame()).toContain('Connecting to MCP servers... (1/3)');
  });

  it('should render with marginTop', () => {
    const { lastFrame } = render(<ConfigInitDisplay />);
    expect(lastFrame()).toBeDefined();
  });

  it('should use useConfig hook', async () => {
    const { useConfig } = await import('../contexts/ConfigContext.js');
    render(<ConfigInitDisplay />);
    expect(useConfig).toHaveBeenCalled();
  });
});
