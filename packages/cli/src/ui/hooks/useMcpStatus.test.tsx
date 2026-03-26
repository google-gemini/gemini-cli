/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { useMcpStatus } from './useMcpStatus.js';
import {
  MCPDiscoveryState,
  type Config,
  CoreEvent,
  coreEvents,
} from '@google/gemini-cli-core';

describe('useMcpStatus', () => {
  let mockConfig: Config;
  let mockMcpClientManager: {
    getDiscoveryState: Mock<() => MCPDiscoveryState>;
    getMcpServerCount: Mock<() => number>;
  };

  beforeEach(() => {
    mockMcpClientManager = {
      getDiscoveryState: vi.fn().mockReturnValue(MCPDiscoveryState.NOT_STARTED),
      getMcpServerCount: vi.fn().mockReturnValue(0),
    };

    mockConfig = {
      getMcpClientManager: vi.fn().mockReturnValue(mockMcpClientManager),
    } as unknown as Config;
  });

  const renderMcpStatusHook = async (config: Config) => {
    let hookResult: ReturnType<typeof useMcpStatus>;
    function TestComponent({ config }: { config: Config }) {
      hookResult = useMcpStatus(config);
      return null;
    }
    await render(<TestComponent config={config} />);
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
    };
  };

  it('should initialize with correct values (no servers)', async () => {
    const { result } = await renderMcpStatusHook(mockConfig);

    expect(result.current.discoveryState).toBe(MCPDiscoveryState.NOT_STARTED);
    expect(result.current.mcpServerCount).toBe(0);
    expect(result.current.isMcpReady).toBe(true);
  });

  it('should initialize with correct values (with servers, not started)', async () => {
    mockMcpClientManager.getMcpServerCount.mockReturnValue(1);
    const { result } = await renderMcpStatusHook(mockConfig);

    expect(result.current.isMcpReady).toBe(false);
  });

  it('should not be ready while in progress', async () => {
    mockMcpClientManager.getDiscoveryState.mockReturnValue(
      MCPDiscoveryState.IN_PROGRESS,
    );
    mockMcpClientManager.getMcpServerCount.mockReturnValue(1);
    const { result } = await renderMcpStatusHook(mockConfig);

    expect(result.current.isMcpReady).toBe(false);
  });

  it('should update state when McpClientUpdate is emitted', async () => {
    mockMcpClientManager.getMcpServerCount.mockReturnValue(1);
    mockMcpClientManager.getDiscoveryState.mockReturnValue(
      MCPDiscoveryState.IN_PROGRESS,
    );
    const { result } = await renderMcpStatusHook(mockConfig);

    expect(result.current.isMcpReady).toBe(false);

    mockMcpClientManager.getDiscoveryState.mockReturnValue(
      MCPDiscoveryState.COMPLETED,
    );

    act(() => {
      coreEvents.emit(CoreEvent.McpClientUpdate, new Map());
    });

    expect(result.current.discoveryState).toBe(MCPDiscoveryState.COMPLETED);
    expect(result.current.isMcpReady).toBe(true);
  });
});
