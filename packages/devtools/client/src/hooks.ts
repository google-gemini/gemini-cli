/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type {
  NetworkLog,
  InspectorConsoleLog as ConsoleLog,
} from '../../src/types.js';

export type { NetworkLog };
export type { InspectorConsoleLog as ConsoleLog } from '../../src/types.js';

export function useDevToolsData() {
  const [networkLogs, setNetworkLogs] = useState<NetworkLog[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedSessions, setConnectedSessions] = useState<string[]>([]);

  useEffect(() => {
    const evtSource = new EventSource('/events');

    evtSource.onopen = () => setIsConnected(true);
    evtSource.onerror = () => setIsConnected(false);

    evtSource.addEventListener('snapshot', (e) => {
      const data = JSON.parse(e.data);
      // Merge with existing data to preserve logs across server restarts
      setNetworkLogs((prev) => {
        if (data.networkLogs.length === 0) return prev;
        const merged = new Map(prev.map((l: NetworkLog) => [l.id, l]));
        for (const log of data.networkLogs) merged.set(log.id, log);
        return Array.from(merged.values());
      });
      setConsoleLogs((prev) => {
        if (data.consoleLogs.length === 0) return prev;
        const existingIds = new Set(prev.map((l: ConsoleLog) => l.id));
        const newLogs = data.consoleLogs.filter(
          (l: ConsoleLog) => !existingIds.has(l.id),
        );
        const merged = [...prev, ...newLogs];
        return merged.length > 5000 ? merged.slice(-5000) : merged;
      });
      setConnectedSessions(data.sessions);
    });

    evtSource.addEventListener('network', (e) => {
      const log = JSON.parse(e.data) as NetworkLog;
      setNetworkLogs((prev) => {
        const idx = prev.findIndex((l) => l.id === log.id);
        if (idx > -1) {
          const next = [...prev];
          next[idx] = log;
          return next;
        }
        return [...prev, log];
      });
    });

    evtSource.addEventListener('console', (e) => {
      const log = JSON.parse(e.data) as ConsoleLog;
      setConsoleLogs((prev) => {
        const next = [...prev, log];
        return next.length > 5000 ? next.slice(-5000) : next;
      });
    });

    evtSource.addEventListener('session', (e) => {
      setConnectedSessions(JSON.parse(e.data));
    });

    return () => evtSource.close();
  }, []);

  return { networkLogs, consoleLogs, isConnected, connectedSessions };
}
