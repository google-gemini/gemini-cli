/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { READ_FILE_TOOL_NAME, EDIT_TOOL_NAME } from '@google/gemini-cli-core';

const FILES = {
  'package.json': JSON.stringify({
    name: 'score-api',
    version: '1.0.0',
    type: 'module',
  }),
  'config.ts': [
    "export const SCORE_TABLE = 'user_scores';",
    'export const MAX_RECORDS_PER_USER = 100;',
  ].join('\n'),
  'repository.ts': [
    "import { SCORE_TABLE } from './config.js';",
    '',
    'export interface ScoreRecord {',
    '  id: string;',
    '  value: number;',
    '}',
    '',
    'export function getScoreRecords(userId: string): ScoreRecord[] {',
    '  const table = SCORE_TABLE;',
    '  console.debug(`Querying ${table}`);',
    '  return [',
    "    { id: 'score-abc', value: 42 },",
    "    { id: 'score-def', value: 18 },",
    "    { id: 'score-ghi', value: 7 },",
    '  ];',
    '}',
    '',
    'export function calculateTotal(records: ScoreRecord[]): number {',
    '  return records.reduce((sum, r) => sum + r.id.length, 0);',
    '}',
  ].join('\n'),
  'services.ts': [
    "import { getScoreRecords, calculateTotal } from './repository.js';",
    '',
    'export function getUserScore(userId: string): number {',
    '  const records = getScoreRecords(userId);',
    '  return calculateTotal(records);',
    '}',
  ].join('\n'),
  'handlers.ts': [
    "import { getUserScore } from './services.js';",
    '',
    'export function handleGetUserScore(',
    '  userId: string,',
    '): { userId: string; totalScore: number } {',
    '  const totalScore = getUserScore(userId);',
    '  return { userId, totalScore };',
    '}',
  ].join('\n'),
  'routes.ts': [
    "import { handleGetUserScore } from './handlers.js';",
    '',
    'type Request = { params: { id: string } };',
    'type Response = { json: (data: unknown) => void };',
    'type App = {',
    '  get: (path: string, fn: (req: Request, res: Response) => void) => void;',
    '};',
    '',
    'export function registerRoutes(app: App): void {',
    "  app.get('/users/:id/total-score', (req, res) => {",
    '    const result = handleGetUserScore(req.params.id);',
    '    res.json(result);',
    '  });',
    '}',
  ].join('\n'),
} as const;

function getFilePath(args: unknown): string | undefined {
  if (typeof args === 'object' && args !== null && 'file_path' in args) {
    return (args as { file_path?: string }).file_path;
  }
  return undefined;
}

describe('cross_module_reasoning', () => {
  /**
   * Ensures the agent traces import dependencies to identify root cause
   * rather than patching the layer where the symptom appears.
   *
   * A 4-level chain (routes → handlers → services → repository) is used
   * where the bug originates in repository.ts but manifests at the HTTP
   * response layer. The bug (summing r.id.length instead of r.value) is
   * intentionally not grep-discoverable — the agent must understand the
   * function's intent by reading the surrounding context.
   *
   * Directly relevant to issue #23316 (Long-Context & Complex Reasoning
   * Evaluation Dataset): correctly attributing bugs in deep dependency
   * chains is the core capability the benchmark dataset is designed to
   * measure.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should trace import chain to fix root cause, not symptom layer',
    prompt:
      'Users are reporting that the /users/:id/total-score endpoint returns wrong values. Investigate and fix the bug. Do not run the server.',
    files: FILES,
    assert: async (rig, _result) => {
      const toolLogs = rig.readToolLogs();

      // --- Assertion 1: repository.ts was edited ---
      const editCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === EDIT_TOOL_NAME ||
          log.toolRequest.name === 'write_file',
      );
      const repoEdits = editCalls.filter((call) => {
        try {
          const filePath = getFilePath(JSON.parse(call.toolRequest.args));
          return filePath?.includes('repository.ts') ?? false;
        } catch {
          return false;
        }
      });
      expect(
        repoEdits.length,
        'Agent should have edited repository.ts (root cause layer)',
      ).toBeGreaterThanOrEqual(1);

      // --- Assertion 2: symptom layers were not edited ---
      const symptomEdits = editCalls.filter((call) => {
        try {
          const filePath = getFilePath(JSON.parse(call.toolRequest.args));
          return (
            (filePath?.includes('routes.ts') ?? false) ||
            (filePath?.includes('handlers.ts') ?? false)
          );
        } catch {
          return false;
        }
      });
      expect(
        symptomEdits.length,
        'Agent should not have edited routes.ts or handlers.ts (symptom layers)',
      ).toBe(0);

      // --- Assertion 3: chain traversal happened before the first edit ---
      const firstRepoEditIndex = toolLogs.findIndex((log) => {
        if (
          log.toolRequest.name !== EDIT_TOOL_NAME &&
          log.toolRequest.name !== 'write_file'
        )
          return false;
        try {
          const filePath = getFilePath(JSON.parse(log.toolRequest.args));
          return filePath?.includes('repository.ts') ?? false;
        } catch {
          return false;
        }
      });

      // If repository.ts was never edited, scan all logs — assertion 1 will catch the missing edit
      const logsBeforeEdit =
        firstRepoEditIndex >= 0
          ? toolLogs.slice(0, firstRepoEditIndex)
          : toolLogs;

      const chainFilesRead = new Set<string>();
      for (const log of logsBeforeEdit) {
        if (log.toolRequest.name !== READ_FILE_TOOL_NAME) continue;
        try {
          const filePath = getFilePath(JSON.parse(log.toolRequest.args));
          if (filePath?.includes('routes.ts')) chainFilesRead.add('routes.ts');
          if (filePath?.includes('handlers.ts'))
            chainFilesRead.add('handlers.ts');
          if (filePath?.includes('services.ts'))
            chainFilesRead.add('services.ts');
        } catch {
          // ignore malformed log entries
        }
      }

      expect(
        chainFilesRead.size,
        `Agent should have read at least 2 chain files before editing repository.ts. ` +
          `Files read: ${[...chainFilesRead].join(', ') || 'none'}`,
      ).toBeGreaterThanOrEqual(2);

      // --- Assertion 4: fix is correct — broken pattern removed ---
      // repository.ts always exists on disk (written from FILES before the agent runs),
      // so readFile will not throw. If the agent never edited it, the original content
      // still contains r.id.length and this assertion will fail correctly.
      const repoContent = rig.readFile('repository.ts');
      expect(
        repoContent,
        'repository.ts should no longer contain r.id.length after the fix',
      ).not.toContain('r.id.length');
    },
  });
});
