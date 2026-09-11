/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { ConversationRecord } from '@google/gemini-cli-core';
import { analyzeSessionTurns } from '../utils/session-turns.js';

function makeConversation(
  messages: Array<Record<string, unknown>>,
): ConversationRecord {
  return {
    sessionId: 'session-1',
    projectHash: 'hash-1',
    startTime: '2026-01-01T00:00:00.000Z',
    lastUpdated: '2026-01-01T00:00:00.000Z',
    messages,
  } as unknown as ConversationRecord;
}

function userMessage(id: string, text: string): Record<string, unknown> {
  return { id, type: 'user', content: [{ text }] };
}

function geminiMessage(
  toolCalls: unknown,
  id = 'gemini-1',
): Record<string, unknown> {
  return {
    id,
    type: 'gemini',
    content: [{ text: 'Done' }],
    toolCalls,
  };
}

function analyzeWithToolCalls(toolCalls: unknown) {
  return () =>
    analyzeSessionTurns(
      makeConversation([
        userMessage('user-1', 'inspect the repository'),
        geminiMessage(toolCalls),
      ]),
    );
}

describe('analyzeSessionTurns synthetic summaries', () => {
  it.each([
    [
      'scratchpad-prefixed snapshot',
      '<scratchpad>private reasoning</scratchpad>\n<state_snapshot>x</state_snapshot>',
    ],
    [
      'scratchpad without a snapshot',
      '  <scratchpad>private reasoning</scratchpad>',
    ],
    [
      'snapshot following other text',
      'Summary follows:\n<state_snapshot>x</state_snapshot>',
    ],
    ['bare snapshot', '<state_snapshot>x</state_snapshot>'],
    [
      'legacy truncation note',
      '### [System Note: Conversation History Truncated]\nsummary',
    ],
  ])('rejects a synthetic %s', (_label, prompt) => {
    const analysis = analyzeSessionTurns(
      makeConversation([userMessage('user-1', prompt)]),
    );

    expect(analysis.turns).toHaveLength(0);
    expect(analysis.unsupportedTurns).toEqual([
      {
        messageId: 'user-1',
        reason:
          'Synthetic conversation-history summaries cannot be used as human eval prompts.',
      },
    ]);
  });

  it('keeps an ordinary plain-text user turn eligible', () => {
    const analysis = analyzeSessionTurns(
      makeConversation([userMessage('user-1', 'please fix the login bug')]),
    );

    expect(analysis.turns).toHaveLength(1);
    expect(analysis.turns[0].prompt).toBe('please fix the login bug');
  });
});

describe('analyzeSessionTurns tool-name compatibility', () => {
  it('canonicalizes a legacy name before extracting candidate paths', () => {
    const analysis = analyzeWithToolCalls([
      {
        id: 'tool-1',
        name: 'search_file_content',
        status: 'success',
        args: { dir_path: 'src' },
      },
    ])();

    expect(analysis.turns[0].observedTools).toEqual([
      { name: 'grep_search', status: 'success' },
    ]);
    expect(analysis.turns[0].candidatePaths).toEqual(['src']);
  });

  it('preserves an unknown runtime tool name as evidence', () => {
    const analysis = analyzeWithToolCalls([
      {
        id: 'tool-1',
        name: 'server__custom_tool',
        status: 'success',
        args: {},
      },
    ])();

    expect(analysis.turns[0].observedTools).toEqual([
      { name: 'server__custom_tool', status: 'success' },
    ]);
  });
});

describe('analyzeSessionTurns malformed tool calls', () => {
  it.each([
    ['non-array toolCalls', { name: 'read_file' }],
    ['null call', [null]],
    ['array call', [[]]],
    ['missing status and args', [{ name: 'read_file' }]],
    ['empty name', [{ name: '', status: 'success', args: {} }]],
    ['blank status', [{ name: 'read_file', status: '  ', args: {} }]],
    [
      'array args',
      [{ name: 'read_file', status: 'success', args: ['file.txt'] }],
    ],
  ])('rejects %s with a clear error', (_label, toolCalls) => {
    expect(analyzeWithToolCalls(toolCalls)).toThrow(
      'Session contains a malformed tool call record.',
    );
  });

  it('does not echo malformed record values in the error', () => {
    const run = analyzeWithToolCalls([
      { name: 'DO_NOT_ECHO', status: 'success' },
    ]);
    let message = '';

    try {
      run();
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('Session contains a malformed tool call record.');
    expect(message).not.toContain('DO_NOT_ECHO');
  });
});
