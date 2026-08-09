/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import {
  type Config,
  coreEvents,
  MCPDiscoveryState,
  CoreEvent,
} from '@google/gemini-cli-core';

export function useMcpStatus(config: Config) {
  const [discoveryState, setDiscoveryState] = useState<MCPDiscoveryState>(
    () =>
      config.getMcpClientManager()?.getDiscoveryState() ??
      MCPDiscoveryState.NOT_STARTED,
  );

  const [mcpServerCount, setMcpServerCount] = useState<number>(
    () => config.getMcpClientManager()?.getMcpServerCount() ?? 0,
  );

  useEffect(() => {
    const onChange = () => {
      const manager = config.getMcpClientManager();
      if (manager) {
        setDiscoveryState(manager.getDiscoveryState());
        setMcpServerCount(manager.getMcpServerCount());
      }
    };

    coreEvents.on(CoreEvent.McpClientUpdate, onChange);
    return () => {
      coreEvents.off(CoreEvent.McpClientUpdate, onChange);
    };
  }, [config]);

  // We are ready if discovery has completed, OR if it hasn't even started and there are no servers.
  const isMcpReady =
    discoveryState === MCPDiscoveryState.COMPLETED ||
    (discoveryState === MCPDiscoveryState.NOT_STARTED && mcpServerCount === 0);

  return {
    discoveryState,
    mcpServerCount,
    isMcpReady,
  };
}
