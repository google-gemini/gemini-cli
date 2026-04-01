/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { ProcessMetrics } from './schema.js';
import {
  buildEventFingerprint,
  extractStreamJsonFingerprints,
  mergeProcessMetrics,
} from './metric-merge.js';

function createMetrics(
  overrides: Partial<ProcessMetrics> = {},
): ProcessMetrics {
  return {
    toolCallCount: 0,
    toolNames: [],
    apiRequestCount: 0,
    apiErrorCount: 0,
    chatCompressionCount: 0,
    compressionTokensSavedTotal: 0,
    assistantMessageCount: 0,
    delegationCount: 0,
    delegatedAgentNames: [],
    filesRead: [],
    filesEdited: [],
    filesWritten: [],
    fileReadCount: 0,
    fileEditCount: 0,
    fileWriteCount: 0,
    searchToolCallCount: 0,
    durationMs: 0,
    ...overrides,
  };
}

describe('metric-merge', () => {
  it('builds stable fingerprints for logically identical events', () => {
    const eventA = {
      type: 'tool_use',
      timestamp: '2026-03-30T00:00:00.000Z',
      tool_name: 'read_file',
      tool_id: 'tool-1',
      parameters: { b: 2, a: 1 },
    };
    const eventB = {
      type: 'tool_use',
      timestamp: '2026-03-30T00:00:00.000Z',
      tool_name: 'read_file',
      tool_id: 'tool-1',
      parameters: { a: 1, b: 2 },
    };

    expect(buildEventFingerprint(eventA)).toBe(buildEventFingerprint(eventB));
  });

  it('extracts stream-json fingerprints from jsonl content', () => {
    const content = [
      JSON.stringify({
        type: 'message',
        timestamp: '2026-03-30T00:00:00.000Z',
        role: 'assistant',
        content: 'hello',
      }),
      JSON.stringify({
        type: 'tool_use',
        timestamp: '2026-03-30T00:00:01.000Z',
        tool_name: 'read_file',
        tool_id: 'tool-1',
        parameters: { file_path: 'a.txt' },
      }),
    ].join('\n');

    const fingerprints = extractStreamJsonFingerprints(content);
    expect(fingerprints.size).toBe(2);
  });

  it('deduplicates fully overlapping metrics', () => {
    const shared = new Set([
      'shared-tool-1',
      'shared-message-1',
      'shared-read-1',
    ]);
    const merged = mergeProcessMetrics(
      createMetrics({
        toolCallCount: 2,
        assistantMessageCount: 2,
        fileReadCount: 1,
        toolNames: ['read_file'],
        filesRead: ['a.txt'],
      }),
      createMetrics({
        toolCallCount: 2,
        assistantMessageCount: 2,
        fileReadCount: 1,
        toolNames: ['read_file'],
        filesRead: ['a.txt'],
      }),
      shared,
      shared,
    );

    expect(merged.toolCallCount).toBe(1);
    expect(merged.assistantMessageCount).toBe(1);
    expect(merged.fileReadCount).toBe(1);
    expect(merged.filesRead).toEqual(['a.txt']);
  });

  it('adds disjoint metrics when no fingerprints are available', () => {
    const merged = mergeProcessMetrics(
      createMetrics({
        toolCallCount: 2,
        apiRequestCount: 1,
        assistantMessageCount: 1,
        fileReadCount: 1,
        fileWriteCount: 0,
        toolNames: ['read_file'],
        filesRead: ['a.txt'],
      }),
      createMetrics({
        toolCallCount: 1,
        apiRequestCount: 2,
        assistantMessageCount: 3,
        fileReadCount: 0,
        fileWriteCount: 1,
        toolNames: ['write_file'],
        filesWritten: ['b.txt'],
      }),
      new Set(),
      new Set(),
    );

    expect(merged.toolCallCount).toBe(3);
    expect(merged.apiRequestCount).toBe(3);
    expect(merged.assistantMessageCount).toBe(4);
    expect(merged.fileReadCount).toBe(1);
    expect(merged.fileWriteCount).toBe(1);
    expect(merged.toolNames).toEqual(['read_file', 'write_file']);
  });

  it('deduplicates partially overlapping metrics', () => {
    const stdoutFingerprints = new Set([
      'shared-tool-1',
      'shared-message-1',
      'shared-read-1',
      'stdout-only-tool-1',
      'stdout-only-write-1',
    ]);
    const activityFingerprints = new Set([
      'shared-tool-1',
      'shared-message-1',
      'shared-read-1',
      'activity-only-tool-1',
      'activity-only-read-1',
    ]);

    const merged = mergeProcessMetrics(
      createMetrics({
        toolCallCount: 2,
        assistantMessageCount: 2,
        fileReadCount: 2,
        toolNames: ['read_file'],
        filesRead: ['a.txt'],
      }),
      createMetrics({
        toolCallCount: 2,
        assistantMessageCount: 2,
        fileReadCount: 1,
        fileWriteCount: 1,
        toolNames: ['read_file', 'write_file'],
        filesRead: ['a.txt'],
        filesWritten: ['b.txt'],
      }),
      stdoutFingerprints,
      activityFingerprints,
    );

    expect(merged.toolCallCount).toBe(1);
    expect(merged.assistantMessageCount).toBe(1);
    expect(merged.fileReadCount).toBe(2);
    expect(merged.fileWriteCount).toBe(1);
    expect(merged.filesRead).toEqual(['a.txt']);
    expect(merged.filesWritten).toEqual(['b.txt']);
  });
});
