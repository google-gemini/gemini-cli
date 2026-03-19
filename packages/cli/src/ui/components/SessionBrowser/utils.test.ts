/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { sortSessions, findTextMatches, filterSessions } from './utils.js';
import type { SessionInfo } from '../../../utils/sessionUtils.js';

describe('SessionBrowser utils', () => {
  const createTestSession = (overrides: Partial<SessionInfo>): SessionInfo => ({
    id: 'test-id',
    file: 'test-file',
    fileName: 'test-file.json',
    startTime: '2025-01-01T10:00:00Z',
    lastUpdated: '2025-01-01T10:00:00Z',
    messageCount: 1,
    displayName: 'Test Session',
    firstUserMessage: 'Hello',
    isCurrentSession: false,
    index: 0,
    ...overrides,
  });

  describe('sortSessions', () => {
    it('sorts by date ascending/descending', () => {
      const older = createTestSession({
        id: '1',
        lastUpdated: '2025-01-01T10:00:00Z',
      });
      const newer = createTestSession({
        id: '2',
        lastUpdated: '2025-01-02T10:00:00Z',
      });

      const desc = sortSessions([older, newer], 'date', false);
      expect(desc[0].id).toBe('2');

      const asc = sortSessions([older, newer], 'date', true);
      expect(asc[0].id).toBe('1');
    });

    it('sorts by message count ascending/descending', () => {
      const more = createTestSession({ id: '1', messageCount: 10 });
      const less = createTestSession({ id: '2', messageCount: 2 });

      const desc = sortSessions([more, less], 'messages', false);
      expect(desc[0].id).toBe('1');

      const asc = sortSessions([more, less], 'messages', true);
      expect(asc[0].id).toBe('2');
    });

    it('sorts by name ascending/descending', () => {
      const apple = createTestSession({ id: '1', displayName: 'Apple' });
      const banana = createTestSession({ id: '2', displayName: 'Banana' });

      const asc = sortSessions([apple, banana], 'name', true);
      expect(asc[0].id).toBe('2'); // Reversed alpha

      const desc = sortSessions([apple, banana], 'name', false);
      expect(desc[0].id).toBe('1');
    });
  });

  describe('findTextMatches', () => {
    it('returns empty array if query is practically empty', () => {
      expect(
        findTextMatches([{ role: 'user', content: 'hello world' }], '   '),
      ).toEqual([]);
    });

    it('finds simple matches with surrounding context', () => {
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        { role: 'user', content: 'What is the capital of France?' },
      ];

      const matches = findTextMatches(messages, 'capital');
      expect(matches.length).toBe(1);
      expect(matches[0].match).toBe('capital');
      expect(matches[0].before.endsWith('the ')).toBe(true);
      expect(matches[0].after.startsWith(' of')).toBe(true);
      expect(matches[0].role).toBe('user');
    });

    it('finds multiple matches in a single message', () => {
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        { role: 'user', content: 'test here test there' },
      ];

      const matches = findTextMatches(messages, 'test');
      expect(matches.length).toBe(2);
    });
  });

  describe('filterSessions', () => {
    it('returns all sessions when query is blank and clears existing snippets', () => {
      const sessions = [createTestSession({ id: '1', matchCount: 5 })];

      const result = filterSessions(sessions, '  ');
      expect(result.length).toBe(1);
      expect(result[0].matchCount).toBeUndefined();
    });

    it('filters by displayName', () => {
      const session1 = createTestSession({
        id: '1',
        displayName: 'Cats and Dogs',
      });
      const session2 = createTestSession({ id: '2', displayName: 'Fish' });

      const result = filterSessions([session1, session2], 'cat');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });

    it('populates match snippets if it matches content inside messages array', () => {
      const sessionWithMessages = createTestSession({
        id: '1',
        displayName: 'Unrelated Title',
        fullContent: 'This mentions a giraffe',
        messages: [{ role: 'user', content: 'This mentions a giraffe' }],
      });

      const result = filterSessions([sessionWithMessages], 'giraffe');
      expect(result.length).toBe(1);
      expect(result[0].matchCount).toBe(1);
      expect(result[0].matchSnippets?.[0].match).toBe('giraffe');
    });
  });
});
