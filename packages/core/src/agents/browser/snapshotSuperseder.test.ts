/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  supersedeStaleSnapshots,
  SNAPSHOT_SUPERSEDED_PLACEHOLDER,
} from './snapshotSuperseder.js';
import type { GeminiChat } from '../../core/geminiChat.js';
import type { Content } from '@google/genai';

/** Builds a minimal mock GeminiChat around a mutable history array. */
function createMockChat(history: Content[]): GeminiChat {
  return {
    getHistory: vi.fn(() => [...history]),
    setHistory: vi.fn((newHistory: readonly Content[]) => {
      history.length = 0;
      history.push(...newHistory);
    }),
  } as unknown as GeminiChat;
}

/** Helper: creates a take_snapshot functionResponse part. */
function snapshotResponse(output: string) {
  return {
    functionResponse: {
      name: 'take_snapshot',
      response: { output },
    },
  };
}

/** Helper: creates a non-snapshot functionResponse part. */
function otherToolResponse(name: string, output: string) {
  return {
    functionResponse: {
      name,
      response: { output },
    },
  };
}

describe('supersedeStaleSnapshots', () => {
  let history: Content[];
  let chat: GeminiChat;

  beforeEach(() => {
    history = [];
  });

  it('should no-op when history has no snapshots', () => {
    history.push(
      { role: 'user', parts: [{ text: 'Click the button' }] },
      {
        role: 'user',
        parts: [otherToolResponse('click', 'Clicked element')],
      },
    );
    chat = createMockChat(history);

    supersedeStaleSnapshots(chat);

    expect(chat.setHistory).not.toHaveBeenCalled();
  });

  it('should no-op when history has exactly 1 snapshot', () => {
    history.push(
      { role: 'user', parts: [{ text: 'Navigate to page' }] },
      {
        role: 'user',
        parts: [snapshotResponse('<tree>big accessibility tree</tree>')],
      },
    );
    chat = createMockChat(history);

    supersedeStaleSnapshots(chat);

    expect(chat.setHistory).not.toHaveBeenCalled();
  });

  it('should replace all but the last snapshot when there are 2+', () => {
    history.push(
      {
        role: 'user',
        parts: [snapshotResponse('<tree>snapshot 1</tree>')],
      },
      {
        role: 'user',
        parts: [otherToolResponse('click', 'Clicked OK')],
      },
      {
        role: 'user',
        parts: [snapshotResponse('<tree>snapshot 2</tree>')],
      },
      {
        role: 'user',
        parts: [otherToolResponse('type_text', 'Typed hello')],
      },
      {
        role: 'user',
        parts: [snapshotResponse('<tree>snapshot 3 (latest)</tree>')],
      },
    );
    chat = createMockChat(history);

    supersedeStaleSnapshots(chat);

    expect(chat.setHistory).toHaveBeenCalledTimes(1);

    // First two snapshots should be replaced
    const part0 = history[0].parts![0];
    expect(part0.functionResponse?.response).toEqual({
      output: SNAPSHOT_SUPERSEDED_PLACEHOLDER,
    });

    const part2 = history[2].parts![0];
    expect(part2.functionResponse?.response).toEqual({
      output: SNAPSHOT_SUPERSEDED_PLACEHOLDER,
    });

    // Last snapshot should be untouched
    const part4 = history[4].parts![0];
    expect(part4.functionResponse?.response).toEqual({
      output: '<tree>snapshot 3 (latest)</tree>',
    });
  });

  it('should leave non-snapshot tool responses untouched', () => {
    history.push(
      {
        role: 'user',
        parts: [snapshotResponse('<tree>snapshot A</tree>')],
      },
      {
        role: 'user',
        parts: [otherToolResponse('click', 'Clicked button')],
      },
      {
        role: 'user',
        parts: [snapshotResponse('<tree>snapshot B (latest)</tree>')],
      },
    );
    chat = createMockChat(history);

    supersedeStaleSnapshots(chat);

    // click response should be untouched
    const clickPart = history[1].parts![0];
    expect(clickPart.functionResponse?.response).toEqual({
      output: 'Clicked button',
    });
  });

  it('should no-op when all stale snapshots are already superseded', () => {
    history.push(
      {
        role: 'user',
        parts: [snapshotResponse(SNAPSHOT_SUPERSEDED_PLACEHOLDER)],
      },
      {
        role: 'user',
        parts: [snapshotResponse('<tree>current snapshot</tree>')],
      },
    );
    chat = createMockChat(history);

    supersedeStaleSnapshots(chat);

    // Should not call setHistory since nothing changed
    expect(chat.setHistory).not.toHaveBeenCalled();
  });

  it('should handle snapshots in Content entries with multiple parts', () => {
    history.push(
      {
        role: 'user',
        parts: [
          otherToolResponse('click', 'Clicked'),
          snapshotResponse('<tree>snapshot in multi-part</tree>'),
        ],
      },
      {
        role: 'user',
        parts: [snapshotResponse('<tree>latest snapshot</tree>')],
      },
    );
    chat = createMockChat(history);

    supersedeStaleSnapshots(chat);

    expect(chat.setHistory).toHaveBeenCalledTimes(1);

    // The click response (index 0 of parts) should be untouched
    const clickPart = history[0].parts![0];
    expect(clickPart.functionResponse?.response).toEqual({
      output: 'Clicked',
    });

    // The snapshot (index 1 of parts) should be replaced
    const snapshotPart = history[0].parts![1];
    expect(snapshotPart.functionResponse?.response).toEqual({
      output: SNAPSHOT_SUPERSEDED_PLACEHOLDER,
    });

    // Latest snapshot untouched
    const latestPart = history[1].parts![0];
    expect(latestPart.functionResponse?.response).toEqual({
      output: '<tree>latest snapshot</tree>',
    });
  });
});
