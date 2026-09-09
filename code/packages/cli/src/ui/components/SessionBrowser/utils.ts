/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  cleanMessage,
  type SessionInfo,
  type TextMatch,
} from '../../../utils/sessionUtils.js';

/**
 * Sorts an array of sessions by the specified criteria.
 * @param sessions - Array of sessions to sort
 * @param sortBy - Sort criteria: 'date' (lastUpdated), 'messages' (messageCount), or 'name' (displayName)
 * @param reverse - Whether to reverse the sort order (ascending instead of descending)
 * @returns New sorted array of sessions
 */
export const sortSessions = (
  sessions: SessionInfo[],
  sortBy: 'date' | 'messages' | 'name',
  reverse: boolean,
): SessionInfo[] => {
  const sorted = [...sessions].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return (
          new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
        );
      case 'messages':
        return b.messageCount - a.messageCount;
      case 'name':
        return a.displayName.localeCompare(b.displayName);
      default:
        return 0;
    }
  });

  return reverse ? sorted.reverse() : sorted;
};

/**
 * Finds all text matches for a search query within conversation messages.
 * Creates TextMatch objects with context (10 chars before/after) and role information.
 * @param messages - Array of messages to search through
 * @param query - Search query string (case-insensitive)
 * @returns Array of TextMatch objects containing match context and metadata
 */
export const findTextMatches = (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  query: string,
): TextMatch[] => {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const matches: TextMatch[] = [];

  for (const message of messages) {
    const m = cleanMessage(message.content);
    const lowerContent = m.toLowerCase();
    let startIndex = 0;

    while (true) {
      const matchIndex = lowerContent.indexOf(lowerQuery, startIndex);
      if (matchIndex === -1) break;

      const contextStart = Math.max(0, matchIndex - 10);
      const contextEnd = Math.min(m.length, matchIndex + query.length + 10);

      const snippet = m.slice(contextStart, contextEnd);
      const relativeMatchStart = matchIndex - contextStart;
      const relativeMatchEnd = relativeMatchStart + query.length;

      let before = snippet.slice(0, relativeMatchStart);
      const match = snippet.slice(relativeMatchStart, relativeMatchEnd);
      let after = snippet.slice(relativeMatchEnd);

      if (contextStart > 0) before = '…' + before;
      if (contextEnd < m.length) after = after + '…';

      matches.push({ before, match, after, role: message.role });
      startIndex = matchIndex + 1;
    }
  }

  return matches;
};

/**
 * Filters sessions based on a search query, checking titles, IDs, and full content.
 * Also populates matchSnippets and matchCount for sessions with content matches.
 * @param sessions - Array of sessions to filter
 * @param query - Search query string (case-insensitive)
 * @returns Filtered array of sessions that match the query
 */
export const filterSessions = (
  sessions: SessionInfo[],
  query: string,
): SessionInfo[] => {
  if (!query.trim()) {
    return sessions.map((session) => ({
      ...session,
      matchSnippets: undefined,
      matchCount: undefined,
    }));
  }

  const lowerQuery = query.toLowerCase();
  return sessions.filter((session) => {
    const titleMatch =
      session.displayName.toLowerCase().includes(lowerQuery) ||
      session.id.toLowerCase().includes(lowerQuery) ||
      session.firstUserMessage.toLowerCase().includes(lowerQuery);

    const contentMatch = session.fullContent
      ?.toLowerCase()
      .includes(lowerQuery);

    if (titleMatch || contentMatch) {
      if (session.messages) {
        session.matchSnippets = findTextMatches(session.messages, query);
        session.matchCount = session.matchSnippets.length;
      }
      return true;
    }

    return false;
  });
};
