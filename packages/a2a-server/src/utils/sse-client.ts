/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TaskEvent } from './event-log.js';

/**
 * SSE event types sent by the background agent stream endpoint.
 */
export type SSEEventType = 'init' | 'evt' | 'heartbeat';

/**
 * Initial connection event with current task state.
 */
export interface SSEInitEvent {
  type: 'init';
  lastEventId: number;
  state: string;
  pendingApprovals: number;
}

/**
 * Heartbeat event sent periodically to keep connection alive.
 */
export interface SSEHeartbeatEvent {
  type: 'heartbeat';
  state: string;
  pendingApprovals: number;
}

/**
 * Regular task event from the event log.
 */
export interface SSETaskEvent {
  type: 'evt';
  data: TaskEvent;
}

export type SSEEvent = SSEInitEvent | SSEHeartbeatEvent | SSETaskEvent;

/**
 * Options for the SSE client.
 */
export interface SSEClientOptions {
  /** Runner port where the background agent server is running */
  runnerPort: number;
  /** Task ID to stream events for */
  taskId: string;
  /** Authentication token for the runner */
  authToken: string;
  /** Event ID to resume from (default: 0 for all events) */
  afterEventId?: number;
  /** Callback for init events */
  onInit?: (event: SSEInitEvent) => void;
  /** Callback for heartbeat events */
  onHeartbeat?: (event: SSEHeartbeatEvent) => void;
  /** Callback for task events */
  onEvent?: (event: TaskEvent) => void;
  /** Callback for connection errors */
  onError?: (error: Error) => void;
  /** Callback when connection closes */
  onClose?: () => void;
}

/**
 * Creates an SSE client for streaming background task events.
 *
 * @example
 * ```typescript
 * const client = createEventStreamClient({
 *   runnerPort: 8080,
 *   taskId: 'bg-abc123',
 *   authToken: 'secret',
 *   onInit: (e) => console.log('Connected, state:', e.state),
 *   onEvent: (e) => console.log('Event:', e.type, e.summary),
 *   onHeartbeat: (e) => console.log('Heartbeat, state:', e.state),
 * });
 *
 * // Later, to disconnect:
 * client.disconnect();
 * ```
 */
export function createEventStreamClient(options: SSEClientOptions): { disconnect: () => void } {
  const {
    runnerPort,
    taskId,
    authToken,
    afterEventId = 0,
    onInit,
    onHeartbeat,
    onEvent,
    onError,
    onClose,
  } = options;

  const abortController = new AbortController();
  let stopped = false;

  const connect = async () => {
    try {
      const url = `http://127.0.0.1:${runnerPort}/background/tasks/${taskId}/events/stream?after=${afterEventId}`;
      const response = await fetch(url, {
        headers: {
          'X-Auth-Token': authToken,
          Accept: 'text/event-stream',
        },
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE format: "event: <type>\ndata: <json>\n\n"
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';

        for (const message of messages) {
          if (!message.trim()) continue;

          const lines = message.split('\n');
          let eventType = 'message';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            }
          }

          if (!eventData) continue;

          try {
            const data = JSON.parse(eventData) as Record<string, unknown>;

            if (eventType === 'init' && onInit) {
              onInit({
                type: 'init',
                lastEventId: (data['lastEventId'] as number) || 0,
                state: (data['state'] as string) || 'unknown',
                pendingApprovals: (data['pendingApprovals'] as number) || 0,
              });
            } else if (eventType === 'heartbeat' && onHeartbeat) {
              onHeartbeat({
                type: 'heartbeat',
                state: (data['state'] as string) || 'unknown',
                pendingApprovals: (data['pendingApprovals'] as number) || 0,
              });
            } else if (eventType === 'evt' && onEvent) {
              onEvent(data as TaskEvent);
            }
          } catch {
            // Ignore JSON parse errors
          }
        }
      }
    } catch (err) {
      if (!stopped && onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (onClose) {
        onClose();
      }
    }
  };

  // Start connection
  connect();

  return {
    disconnect: () => {
      stopped = true;
      abortController.abort();
    },
  };
}

/**
 * Parses a raw SSE message string into its event type and data.
 * Useful for manual SSE parsing.
 */
export function parseSSEMessage(message: string): { eventType: string; data: unknown } | null {
  const lines = message.split('\n');
  let eventType = 'message';
  let eventData = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      eventData = line.slice(6);
    }
  }

  if (!eventData) return null;

  try {
    return { eventType, data: JSON.parse(eventData) };
  } catch {
    return null;
  }
}
