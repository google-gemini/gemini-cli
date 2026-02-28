/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, type Mocked } from 'vitest';
import { updatePolicy } from './policy.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import {
  ToolConfirmationOutcome,
  type AnyDeclarativeTool,
  type ToolEditConfirmationDetails,
} from '../tools/tools.js';
import {
  READ_FILE_TOOL_NAME,
  LS_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WRITE_TODOS_TOOL_NAME,
} from '../tools/tool-names.js';

describe('Scheduler Auto-add Policy Logic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should set persist: true for ProceedAlways if autoAddPolicy is enabled', async () => {
    const mockConfig = {
      getAutoAddPolicy: vi.fn().mockReturnValue(true),
      setApprovalMode: vi.fn(),
    } as unknown as Mocked<Config>;
    const mockMessageBus = {
      publish: vi.fn(),
    } as unknown as Mocked<MessageBus>;
    const tool = {
      name: 'test-tool',
      isSensitive: false,
    } as AnyDeclarativeTool;

    await updatePolicy(tool, ToolConfirmationOutcome.ProceedAlways, undefined, {
      config: mockConfig,
      messageBus: mockMessageBus,
    });

    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.UPDATE_POLICY,
        toolName: 'test-tool',
        persist: true,
      }),
    );
  });

  it('should set persist: false for ProceedAlways if autoAddPolicy is disabled', async () => {
    const mockConfig = {
      getAutoAddPolicy: vi.fn().mockReturnValue(false),
      setApprovalMode: vi.fn(),
    } as unknown as Mocked<Config>;
    const mockMessageBus = {
      publish: vi.fn(),
    } as unknown as Mocked<MessageBus>;
    const tool = {
      name: 'test-tool',
      isSensitive: false,
    } as AnyDeclarativeTool;

    await updatePolicy(tool, ToolConfirmationOutcome.ProceedAlways, undefined, {
      config: mockConfig,
      messageBus: mockMessageBus,
    });

    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.UPDATE_POLICY,
        toolName: 'test-tool',
        persist: false,
      }),
    );
  });

  it('should generate specific argsPattern for edit tools', async () => {
    const mockConfig = {
      getAutoAddPolicy: vi.fn().mockReturnValue(true),
      setApprovalMode: vi.fn(),
    } as unknown as Mocked<Config>;
    const mockMessageBus = {
      publish: vi.fn(),
    } as unknown as Mocked<MessageBus>;
    const tool = {
      name: WRITE_FILE_TOOL_NAME,
      isSensitive: true,
    } as AnyDeclarativeTool;
    const details: ToolEditConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Write',
      fileName: 'test.txt',
      filePath: 'test.txt',
      fileDiff: '',
      originalContent: '',
      newContent: '',
      onConfirm: vi.fn(),
    };

    await updatePolicy(tool, ToolConfirmationOutcome.ProceedAlways, details, {
      config: mockConfig,
      messageBus: mockMessageBus,
    });

    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.UPDATE_POLICY,
        argsPattern: expect.stringMatching(/test.*txt/),
        isSensitive: true,
      }),
    );
  });

  it.each([
    {
      name: 'read_file',
      tool: {
        name: READ_FILE_TOOL_NAME,
        params: { file_path: 'read.me' },
      },
      pattern: /read\\.me/,
    },
    {
      name: 'list_directory',
      tool: {
        name: LS_TOOL_NAME,
        params: { dir_path: './src' },
      },
      pattern: /\.\/src/,
    },
    {
      name: 'glob',
      tool: {
        name: GLOB_TOOL_NAME,
        params: { dir_path: './packages' },
      },
      pattern: /\.\/packages/,
    },
    {
      name: 'grep_search',
      tool: {
        name: GREP_TOOL_NAME,
        params: { dir_path: './src' },
      },
      pattern: /\.\/src/,
    },
    {
      name: 'read_many_files',
      tool: {
        name: READ_MANY_FILES_TOOL_NAME,
        params: { include: ['src/**/*.ts', 'test/'] },
      },
      pattern: /include.*src.*ts.*test/,
    },
    {
      name: 'web_fetch',
      tool: {
        name: WEB_FETCH_TOOL_NAME,
        params: { prompt: 'Summarize https://example.com/page' },
      },
      pattern: /example\\.com/,
    },
    {
      name: 'web_fetch (direct url)',
      tool: {
        name: WEB_FETCH_TOOL_NAME,
        params: { url: 'https://google.com' },
      },
      pattern: /"url":"https:\/\/google\\.com"/,
    },
    {
      name: 'web_search',
      tool: {
        name: WEB_SEARCH_TOOL_NAME,
        params: { query: 'how to bake bread' },
      },
      pattern: /how\\ to\\ bake\\ bread/,
    },
    {
      name: 'write_todos',
      tool: {
        name: WRITE_TODOS_TOOL_NAME,
        params: { todos: [{ description: 'fix the bug', status: 'pending' }] },
      },
      pattern: /fix\\ the\\ bug/,
    },
    {
      name: 'read_file (Windows path)',
      tool: {
        name: READ_FILE_TOOL_NAME,
        params: { file_path: 'C:\\foo\\bar.txt' },
      },
      pattern: /C:\\\\\\\\foo\\\\\\\\bar\\.txt/,
    },
  ])(
    'should generate specific argsPattern for $name',
    async ({ tool, pattern }) => {
      const toolWithSensitive = {
        ...tool,
        isSensitive: true,
      } as unknown as AnyDeclarativeTool;
      const mockConfig = {
        getAutoAddPolicy: vi.fn().mockReturnValue(true),
        setApprovalMode: vi.fn(),
      } as unknown as Mocked<Config>;
      const mockMessageBus = {
        publish: vi.fn(),
      } as unknown as Mocked<MessageBus>;

      await updatePolicy(
        toolWithSensitive,
        ToolConfirmationOutcome.ProceedAlways,
        undefined,
        {
          config: mockConfig,
          messageBus: mockMessageBus,
        },
      );

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: tool.name,
          argsPattern: expect.stringMatching(pattern),
          isSensitive: true,
        }),
      );
    },
  );
});
