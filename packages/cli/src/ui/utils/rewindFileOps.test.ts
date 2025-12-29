/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateTurnStats,
  calculateRewindImpact,
  revertFileChanges,
} from './rewindFileOps.js';
import type {
  ConversationRecord,
  MessageRecord,
  ToolCallRecord,
} from '@google/gemini-cli-core';
import fs from 'node:fs/promises';
import path from 'node:path';

vi.mock('node:fs/promises');

describe('rewindFileOps', () => {
  const mockConversation: ConversationRecord = {
    sessionId: 'test-session',
    projectHash: 'hash',
    startTime: 'time',
    lastUpdated: 'time',
    messages: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateTurnStats', () => {
    it('returns null if no edits found after user message', () => {
      const userMsg: MessageRecord = {
        type: 'user',
        content: 'hello',
        id: '1',
        timestamp: '1',
      };
      const geminiMsg: MessageRecord = {
        type: 'gemini',
        content: 'hi',
        id: '2',
        timestamp: '2',
      };
      mockConversation.messages = [userMsg, geminiMsg];

      const stats = calculateTurnStats(mockConversation, userMsg);
      expect(stats).toBeNull();
    });

    it('calculates stats for single turn correctly', () => {
      const userMsg: MessageRecord = {
        type: 'user',
        content: 'hello',
        id: '1',
        timestamp: '1',
      };
      const toolMsg: MessageRecord = {
        type: 'gemini',
        id: '2',
        timestamp: '2',
        content: '',
        toolCalls: [
          {
            name: 'replace',
            id: 'tool-call-1',
            status: 'success',
            timestamp: '2',
            args: {},
            resultDisplay: {
              fileName: 'file1.ts',
              originalContent: 'old',
              newContent: 'new',
              isNewFile: false,
              diffStat: {
                model_added_lines: 5,
                model_removed_lines: 2,
                user_added_lines: 0,
                user_removed_lines: 0,
                model_added_chars: 100,
                model_removed_chars: 20,
                user_added_chars: 0,
                user_removed_chars: 0,
              },
            },
          },
        ] as unknown as ToolCallRecord[],
      };

      const userMsg2: MessageRecord = {
        type: 'user',
        content: 'next',
        id: '3',
        timestamp: '3',
      };

      mockConversation.messages = [userMsg, toolMsg, userMsg2];

      const stats = calculateTurnStats(mockConversation, userMsg);
      expect(stats).toEqual({
        addedLines: 5,
        removedLines: 2,
        fileCount: 1,
        firstFileName: 'file1.ts',
      });
    });
  });

  describe('calculateRewindImpact', () => {
    it('calculates cumulative stats across multiple turns', () => {
      const userMsg1: MessageRecord = {
        type: 'user',
        content: 'start',
        id: '1',
        timestamp: '1',
      };
      const toolMsg1: MessageRecord = {
        type: 'gemini',
        id: '2',
        timestamp: '2',
        content: '',
        toolCalls: [
          {
            name: 'replace',
            id: 'tool-call-1',
            status: 'success',
            timestamp: '2',
            args: {},
            resultDisplay: {
              fileName: 'file1.ts',
              fileDiff: 'diff1',
              originalContent: 'old',
              newContent: 'new',
              isNewFile: false,
              diffStat: {
                model_added_lines: 5,
                model_removed_lines: 2,
                user_added_lines: 0,
                user_removed_lines: 0,
                model_added_chars: 0,
                model_removed_chars: 0,
                user_added_chars: 0,
                user_removed_chars: 0,
              },
            },
          },
        ] as unknown as ToolCallRecord[],
      };

      const userMsg2: MessageRecord = {
        type: 'user',
        content: 'next',
        id: '3',
        timestamp: '3',
      };

      const toolMsg2: MessageRecord = {
        type: 'gemini',
        id: '4',
        timestamp: '4',
        content: '',
        toolCalls: [
          {
            name: 'replace',
            id: 'tool-call-2',
            status: 'success',
            timestamp: '4',
            args: {},
            resultDisplay: {
              fileName: 'file2.ts',
              fileDiff: 'diff2',
              originalContent: 'old',
              newContent: 'new',
              isNewFile: false,
              diffStat: {
                model_added_lines: 3,
                model_removed_lines: 1,
                user_added_lines: 0,
                user_removed_lines: 0,
                model_added_chars: 0,
                model_removed_chars: 0,
                user_added_chars: 0,
                user_removed_chars: 0,
              },
            },
          },
        ] as unknown as ToolCallRecord[],
      };

      mockConversation.messages = [userMsg1, toolMsg1, userMsg2, toolMsg2];

      const stats = calculateRewindImpact(mockConversation, userMsg1);

      expect(stats).toEqual({
        addedLines: 8, // 5 + 3
        removedLines: 3, // 2 + 1
        fileCount: 2,
        firstFileName: 'file1.ts',
        details: [
          { fileName: 'file1.ts', diff: 'diff1' },
          { fileName: 'file2.ts', diff: 'diff2' },
        ],
      });
    });
  });

  describe('revertFileChanges', () => {
    it('does nothing if message not found', async () => {
      mockConversation.messages = [];
      await revertFileChanges(mockConversation, 'missing-id');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('reverts exact match', async () => {
      const userMsg: MessageRecord = {
        type: 'user',
        content: 'start',
        id: '1',
        timestamp: '1',
      };
      const toolMsg: MessageRecord = {
        type: 'gemini',
        id: '2',
        timestamp: '2',
        content: '',
        toolCalls: [
          {
            name: 'replace',
            id: 'tool-call-1',
            status: 'success',
            timestamp: '2',
            args: {},
            resultDisplay: {
              fileName: 'file.txt',
              filePath: path.resolve('/root/file.txt'),
              originalContent: 'old',
              newContent: 'new',
              isNewFile: false,
              diffStat: {
                model_added_lines: 0,
                model_removed_lines: 0,
                user_added_lines: 0,
                user_removed_lines: 0,
                model_added_chars: 0,
                model_removed_chars: 0,
                user_added_chars: 0,
                user_removed_chars: 0,
              },
            },
          },
        ] as unknown as ToolCallRecord[],
      };

      mockConversation.messages = [userMsg, toolMsg];

      vi.mocked(fs.readFile).mockResolvedValue('new');

      await revertFileChanges(mockConversation, '1');

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.resolve('/root/file.txt'),
        'old',
      );
    });

    it('deletes new file on revert', async () => {
      const userMsg: MessageRecord = {
        type: 'user',
        content: 'start',
        id: '1',
        timestamp: '1',
      };
      const toolMsg: MessageRecord = {
        type: 'gemini',
        id: '2',
        timestamp: '2',
        content: '',
        toolCalls: [
          {
            name: 'write_file',
            id: 'tool-call-2',
            status: 'success',
            timestamp: '2',
            args: {},
            resultDisplay: {
              fileName: 'file.txt',
              filePath: path.resolve('/root/file.txt'),
              originalContent: null,
              newContent: 'content',
              isNewFile: true,
              diffStat: {
                model_added_lines: 0,
                model_removed_lines: 0,
                user_added_lines: 0,
                user_removed_lines: 0,
                model_added_chars: 0,
                model_removed_chars: 0,
                user_added_chars: 0,
                user_removed_chars: 0,
              },
            },
          },
        ] as unknown as ToolCallRecord[],
      };

      mockConversation.messages = [userMsg, toolMsg];

      vi.mocked(fs.readFile).mockResolvedValue('content');

      await revertFileChanges(mockConversation, '1');

      expect(fs.unlink).toHaveBeenCalledWith(path.resolve('/root/file.txt'));
    });
  });
});
