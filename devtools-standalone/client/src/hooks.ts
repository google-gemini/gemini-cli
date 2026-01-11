/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

export interface NetworkLog {
  id: string;
  sessionId?: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: string;
  pending?: boolean;
  response?: {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body?: string;
    durationMs: number;
  };
  error?: string;
}

export interface ConsoleLog {
  id: string;
  sessionId?: string;
  timestamp: number;
  type: 'log' | 'warn' | 'error' | 'debug' | 'info';
  content: string;
}

export function useDevToolsData() {
  const [networkLogs, setNetworkLogs] = useState<NetworkLog[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initial fetch
    fetch('/logs')
      .then((r) => r.json())
      .then(setNetworkLogs)
      .catch(() => {});
    fetch('/console-logs')
      .then((r) => r.json())
      .then(setConsoleLogs)
      .catch(() => {});

    const evtSource = new EventSource('/events');

    evtSource.onopen = () => {
      console.log('SSE Connected');
      setIsConnected(true);
    };
    evtSource.onerror = (e) => {
      console.error('SSE Error:', e);
      setIsConnected(false);
    };

    evtSource.addEventListener('update', () => {
      fetch('/logs')
        .then((r) => r.json())
        .then(setNetworkLogs)
        .catch(() => {});
    });

    evtSource.addEventListener('console-update', () => {
      fetch('/console-logs')
        .then((r) => r.json())
        .then(setConsoleLogs)
        .catch(() => {});
    });

    return () => {
      evtSource.close();
    };
  }, []);

  return { networkLogs, consoleLogs, isConnected };
}
