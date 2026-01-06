/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { z } from 'zod';
import {
  getToolCallDataSchema,
  generateCheckpointFileName,
  formatCheckpointDisplayList,
  getTruncatedCheckpointNames,
  processRestorableToolCalls,
  getCheckpointInfoList,
} from './checkpointUtils.js';
import type { GitService } from '../services/gitService.js';
import type { GeminiClient } from '../core/client.js';
import type { ToolCallRequestInfo } from '../scheduler/types.js';

describe('checkpoint utils', () => {
  describe('getToolCallDataSchema', () => {
    it('should return a schema that validates a basic tool call data object', () => {
      const schema = getToolCallDataSchema();
      const validData = {
        toolCall: { name: 'test-tool', args: { foo: 'bar' } },
      };
      const result = schema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate with an optional history schema', () => {
      const historyItemSchema = z.object({ id: z.number(), event: z.string() });
      const schema = getToolCallDataSchema(historyItemSchema);
      const validData = {
        history: [{ id: 1, event: 'start' }],
        toolCall: { name: 'test-tool', args: {} },
      };
      const result = schema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail validation if history items do not match the schema', () => {
      const historyItemSchema = z.object({ id: z.number(), event: z.string() });
      const schema = getToolCallDataSchema(historyItemSchema);
      const invalidData = {
        history: [{ id: '1', event: 'start' }], // id should be a number
        toolCall: { name: 'test-tool', args: {} },
      };
      const result = schema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate clientHistory with the correct schema', () => {
      const schema = getToolCallDataSchema();
      const validData = {
        clientHistory: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        toolCall: { name: 'test-tool', args: {} },
      };
      const result = schema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('generateCheckpointFileName', () => {
    it('should generate a filename with timestamp, basename, and tool name', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
      const toolCall = {
        callId: '1',
        name: 'replace',
        args: { file_path: '/path/to/my-file.txt' },
        isClientInitiated: false,
        prompt_id: 'p1',
      } as ToolCallRequestInfo;

      const expected = '2025-01-01T12-00-00_000Z-my-file.txt-replace';
      const actual = generateCheckpointFileName(toolCall);
      expect(actual).toBe(expected);

      vi.useRealTimers();
    });

    it('should return null if file_path is not in the tool arguments', () => {
      const toolCall = {
        callId: '1',
        name: 'replace',
        args: { some_other_arg: 'value' },
        isClientInitiated: false,
        prompt_id: 'p1',
      } as ToolCallRequestInfo;

      const actual = generateCheckpointFileName(toolCall);
      expect(actual).toBeNull();
    });
  });

  describe('formatCheckpointDisplayList and getTruncatedCheckpointNames', () => {
    const filenames = [
      '2025-01-01T12-00-00_000Z-my-file.txt-replace.json',
      '2025-01-01T13-00-00_000Z-another.js-write_file.json',
      'no-extension-file',
    ];

    it('getTruncatedCheckpointNames should remove the .json extension', () => {
      const expected = [
        '2025-01-01T12-00-00_000Z-my-file.txt-replace',
        '2025-01-01T13-00-00_000Z-another.js-write_file',
        'no-extension-file',
      ];
      const actual = getTruncatedCheckpointNames(filenames);
      expect(actual).toEqual(expected);
    });

    it('formatCheckpointDisplayList should return a newline-separated string of truncated names', () => {
      const expected = [
        '2025-01-01T12-00-00_000Z-my-file.txt-replace',
        '2025-01-01T13-00-00_000Z-another.js-write_file',
        'no-extension-file',
      ].join('\n');
      const actual = formatCheckpointDisplayList(filenames);
      expect(actual).toEqual(expected);
    });
  });

  describe('processRestorableToolCalls', () => {
    const mockGitService = {
      createFileSnapshot: vi.fn(),
      getCurrentCommitHash: vi.fn(),
    } as unknown as GitService;

    const mockGeminiClient = {
      getHistory: vi.fn(),
    } as unknown as GeminiClient;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should create checkpoints for restorable tool calls', async () => {
      const toolCalls = [
        {
          callId: '1',
          name: 'replace',
          args: { file_path: 'a.txt' },
          prompt_id: 'p1',
          isClientInitiated: false,
        },
      ] as ToolCallRequestInfo[];

      (mockGitService.createFileSnapshot as Mock).mockResolvedValue('hash123');
      (mockGeminiClient.getHistory as Mock).mockReturnValue([
        { role: 'user', parts: [] },
      ]);

      const { checkpointsToWrite, toolCallToCheckpointMap, errors } =
        await processRestorableToolCalls(
          toolCalls,
          mockGitService,
          mockGeminiClient,
          'history-data',
        );

      expect(errors).toHaveLength(0);
      expect(checkpointsToWrite.size).toBe(1);
      expect(toolCallToCheckpointMap.get('1')).toBeDefined();

      const fileName = checkpointsToWrite.values().next().value;
      expect(fileName).toBeDefined();
      const fileContent = JSON.parse(fileName!);

      expect(fileContent.commitHash).toBe('hash123');
      expect(fileContent.history).toBe('history-data');
      expect(fileContent.clientHistory).toEqual([{ role: 'user', parts: [] }]);
      expect(fileContent.toolCall.name).toBe('replace');
      expect(fileContent.messageId).toBe('p1');
    });

    it('should handle git snapshot failure by using current commit hash', async () => {
      const toolCalls = [
        {
          callId: '1',
          name: 'replace',
          args: { file_path: 'a.txt' },
          prompt_id: 'p1',
          isClientInitiated: false,
        },
      ] as ToolCallRequestInfo[];

      (mockGitService.createFileSnapshot as Mock).mockRejectedValue(
        new Error('Snapshot failed'),
      );
      (mockGitService.getCurrentCommitHash as Mock).mockResolvedValue(
        'fallback-hash',
      );

      const { checkpointsToWrite, errors } = await processRestorableToolCalls(
        toolCalls,
        mockGitService,
        mockGeminiClient,
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Failed to create new snapshot');
      expect(checkpointsToWrite.size).toBe(1);
      const value = checkpointsToWrite.values().next().value;
      expect(value).toBeDefined();
      const fileContent = JSON.parse(value!);
      expect(fileContent.commitHash).toBe('fallback-hash');
    });

    it('should skip tool calls with no file_path', async () => {
      const toolCalls = [
        {
          callId: '1',
          name: 'replace',
          args: { not_a_path: 'a.txt' },
          prompt_id: 'p1',
          isClientInitiated: false,
        },
      ] as ToolCallRequestInfo[];
      (mockGitService.createFileSnapshot as Mock).mockResolvedValue('hash123');

      const { checkpointsToWrite, errors } = await processRestorableToolCalls(
        toolCalls,
        mockGitService,
        mockGeminiClient,
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        'Skipping restorable tool call due to missing file_path',
      );
      expect(checkpointsToWrite.size).toBe(0);
    });

    it('should log an error if git snapshot fails and then skip the tool call', async () => {
      const toolCalls = [
        {
          callId: '1',
          name: 'replace',
          args: { file_path: 'a.txt' },
          prompt_id: 'p1',
          isClientInitiated: false,
        },
      ] as ToolCallRequestInfo[];
      (mockGitService.createFileSnapshot as Mock).mockRejectedValue(
        new Error('Snapshot failed'),
      );
      (mockGitService.getCurrentCommitHash as Mock).mockResolvedValue(
        undefined,
      );

      const { checkpointsToWrite, errors } = await processRestorableToolCalls(
        toolCalls,
        mockGitService,
        mockGeminiClient,
      );

      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain('Failed to create new snapshot');
      expect(errors[1]).toContain('Failed to create snapshot for replace');
      expect(checkpointsToWrite.size).toBe(0);
    });
  });

  describe('getCheckpointInfoList', () => {
    it('should parse valid checkpoint files and return a list of info', () => {
      const checkpointFiles = new Map([
        ['checkpoint1.json', JSON.stringify({ messageId: 'msg1' })],
        ['checkpoint2.json', JSON.stringify({ messageId: 'msg2' })],
      ]);

      const expected = [
        { messageId: 'msg1', checkpoint: 'checkpoint1' },
        { messageId: 'msg2', checkpoint: 'checkpoint2' },
      ];

      const actual = getCheckpointInfoList(checkpointFiles);
      expect(actual).toEqual(expected);
    });

    it('should ignore files with invalid JSON', () => {
      const checkpointFiles = new Map([
        ['checkpoint1.json', JSON.stringify({ messageId: 'msg1' })],
        ['invalid.json', 'not-json'],
      ]);

      const expected = [{ messageId: 'msg1', checkpoint: 'checkpoint1' }];
      const actual = getCheckpointInfoList(checkpointFiles);
      expect(actual).toEqual(expected);
    });

    it('should ignore files that are missing a messageId', () => {
      const checkpointFiles = new Map([
        ['checkpoint1.json', JSON.stringify({ messageId: 'msg1' })],
        ['no-msg-id.json', JSON.stringify({ other_prop: 'value' })],
      ]);

      const expected = [{ messageId: 'msg1', checkpoint: 'checkpoint1' }];
      const actual = getCheckpointInfoList(checkpointFiles);
      expect(actual).toEqual(expected);
    });
  });
});
