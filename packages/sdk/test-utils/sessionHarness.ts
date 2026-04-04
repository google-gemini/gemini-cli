/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ServerGeminiStreamEvent } from '@google/gemini-cli-core';
import type { GeminiCliAgent } from '../src/agent.js';
import type { GeminiCliSession } from '../src/session.js';

const trackedSessions = new Set<GeminiCliSession>();

export function trackSession<T extends GeminiCliSession>(session: T): T {
  trackedSessions.add(session);
  return session;
}

export function createManagedSession(
  agent: GeminiCliAgent,
  options?: { sessionId?: string },
): GeminiCliSession {
  return trackSession(agent.session(options));
}

export async function collectSessionEvents(
  session: GeminiCliSession,
  prompt: string,
  signal?: AbortSignal,
): Promise<ServerGeminiStreamEvent[]> {
  const events: ServerGeminiStreamEvent[] = [];
  for await (const event of session.sendStream(prompt, signal)) {
    events.push(event);
  }
  return events;
}

export function collectResponseText(
  events: readonly ServerGeminiStreamEvent[],
): string {
  return events
    .filter((event) => event.type === 'content')
    .map((event) => (typeof event.value === 'string' ? event.value : ''))
    .join('');
}

export async function cleanupTrackedSessions(): Promise<void> {
  const sessions = [...trackedSessions];
  trackedSessions.clear();
  await Promise.allSettled(sessions.map((session) => session.dispose()));
}
