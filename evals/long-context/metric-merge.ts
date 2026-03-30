/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProcessMetrics } from './schema.js';

export function mergeMetricValue(
  primary: number | undefined,
  secondary: number | undefined,
): number | undefined {
  if (primary === undefined) {
    return secondary;
  }
  if (secondary === undefined) {
    return primary;
  }
  return Math.max(primary, secondary);
}

export function mergePathLists(
  primary: string[],
  secondary: string[],
): string[] {
  return Array.from(new Set([...primary, ...secondary]));
}

export function parseJsonLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function sanitizeForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFingerprint(item));
  }
  if (value && typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nestedValue]) => [key, sanitizeForFingerprint(nestedValue)]);
    return Object.fromEntries(sortedEntries);
  }
  return value;
}

export function buildEventFingerprint(event: {
  type?: unknown;
  timestamp?: unknown;
  role?: unknown;
  tool_name?: unknown;
  tool_id?: unknown;
  status?: unknown;
  content?: unknown;
  parameters?: unknown;
  stats?: unknown;
}): string | null {
  if (typeof event.type !== 'string') {
    return null;
  }

  return JSON.stringify({
    type: event.type,
    timestamp: event.timestamp ?? null,
    role: event.role ?? null,
    tool_name: event.tool_name ?? null,
    tool_id: event.tool_id ?? null,
    status: event.status ?? null,
    content: event.content ?? null,
    parameters: sanitizeForFingerprint(event.parameters ?? null),
    stats: sanitizeForFingerprint(event.stats ?? null),
  });
}

export function extractStreamJsonFingerprints(
  fileContent: string,
): Set<string> {
  const fingerprints = new Set<string>();

  for (const line of fileContent.split('\n')) {
    const parsed = parseJsonLine(line);
    if (!parsed) {
      continue;
    }

    const fingerprint = buildEventFingerprint(parsed);
    if (fingerprint) {
      fingerprints.add(fingerprint);
    }
  }

  return fingerprints;
}

export function mergeProcessMetrics(
  primary: ProcessMetrics,
  secondary: ProcessMetrics,
  stdoutFingerprints: Set<string>,
  activityFingerprints: Set<string>,
): ProcessMetrics {
  const hasFingerprints =
    stdoutFingerprints.size > 0 || activityFingerprints.size > 0;
  const sharedFingerprints = new Set(
    [...activityFingerprints].filter((fingerprint) =>
      stdoutFingerprints.has(fingerprint),
    ),
  );

  const dedupeCount = (
    primaryCount: number,
    secondaryCount: number,
    sharedCount: number,
  ) => {
    if (!hasFingerprints) {
      return primaryCount + secondaryCount;
    }
    return Math.max(0, primaryCount + secondaryCount - sharedCount);
  };

  return {
    toolCallCount: dedupeCount(
      primary.toolCallCount,
      secondary.toolCallCount,
      sharedFingerprints.size,
    ),
    toolNames: Array.from(
      new Set([...primary.toolNames, ...secondary.toolNames]),
    ),
    apiRequestCount: primary.apiRequestCount + secondary.apiRequestCount,
    apiErrorCount: primary.apiErrorCount + secondary.apiErrorCount,
    chatCompressionCount:
      primary.chatCompressionCount + secondary.chatCompressionCount,
    compressionTokensSavedTotal:
      primary.compressionTokensSavedTotal +
      secondary.compressionTokensSavedTotal,
    assistantMessageCount: dedupeCount(
      primary.assistantMessageCount,
      secondary.assistantMessageCount,
      sharedFingerprints.size,
    ),
    delegationCount: dedupeCount(
      primary.delegationCount,
      secondary.delegationCount,
      sharedFingerprints.size,
    ),
    delegatedAgentNames: mergePathLists(
      primary.delegatedAgentNames,
      secondary.delegatedAgentNames,
    ),
    filesRead: mergePathLists(primary.filesRead, secondary.filesRead),
    filesEdited: mergePathLists(primary.filesEdited, secondary.filesEdited),
    filesWritten: mergePathLists(primary.filesWritten, secondary.filesWritten),
    fileReadCount: Math.max(
      primary.fileReadCount,
      secondary.fileReadCount,
      mergePathLists(primary.filesRead, secondary.filesRead).length,
    ),
    fileEditCount: Math.max(
      primary.fileEditCount,
      secondary.fileEditCount,
      mergePathLists(primary.filesEdited, secondary.filesEdited).length,
    ),
    fileWriteCount: Math.max(
      primary.fileWriteCount,
      secondary.fileWriteCount,
      mergePathLists(primary.filesWritten, secondary.filesWritten).length,
    ),
    searchToolCallCount: Math.max(
      primary.searchToolCallCount,
      secondary.searchToolCallCount,
    ),
    totalTokens: mergeMetricValue(primary.totalTokens, secondary.totalTokens),
    inputTokens: mergeMetricValue(primary.inputTokens, secondary.inputTokens),
    outputTokens: mergeMetricValue(
      primary.outputTokens,
      secondary.outputTokens,
    ),
    durationMs: mergeMetricValue(primary.durationMs, secondary.durationMs) ?? 0,
  };
}
