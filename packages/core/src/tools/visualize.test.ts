/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VisualizeTool } from './visualize.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises');
vi.mock('../confirmation-bus/message-bus.js');

describe('VisualizeTool', () => {
  let tool: VisualizeTool;
  let messageBus: MessageBus;

  beforeEach(() => {
    messageBus = {} as unknown as MessageBus;
    tool = new VisualizeTool(messageBus);
  });

  it('should return table visualization', async () => {
    const data = [{ name: 'A', value: 1 }];
    const result = await tool.validateBuildAndExecute(
      { data, type: 'table' },
      new AbortController().signal,
    );
    expect(result.returnDisplay).toEqual({
      type: 'table',
      title: undefined,
      data,
      columns: [
        { key: 'name', label: 'name' },
        { key: 'value', label: 'value' },
      ],
      savedFilePath: undefined,
    });
  });

  it('should return bar_chart visualization', async () => {
    const data = [{ label: 'A', value: 10 }];
    const result = await tool.validateBuildAndExecute(
      { data, type: 'bar_chart' },
      new AbortController().signal,
    );
    expect(result.returnDisplay).toMatchObject({
      type: 'bar_chart',
      data,
    });
  });

  it('should save to file if save_as provided', async () => {
    const data = [{ name: 'A', value: 1 }];
    const savePath = '/tmp/test.json';
    (fs.writeFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );

    const result = await tool.validateBuildAndExecute(
      { data, save_as: savePath },
      new AbortController().signal,
    );

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('test.json'),
      expect.stringContaining('"name": "A"'),
    );
    expect(
      (result.returnDisplay as { savedFilePath: string }).savedFilePath,
    ).toBeTruthy();
  });

  it('should return error if data is not an array', async () => {
    const result = await tool.validateBuildAndExecute(
      { data: 'invalid' as unknown as Array<Record<string, unknown>> },
      new AbortController().signal,
    );
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('Data must be an array');
  });

  it('should return diff visualization', async () => {
    const data = { fileDiff: 'diff...', fileName: 'test.ts' };
    const result = await tool.validateBuildAndExecute(
      { data, type: 'diff' },
      new AbortController().signal,
    );
    expect(result.returnDisplay).toMatchObject({
      type: 'diff',
      data,
    });
  });

  it('should return line_chart visualization', async () => {
    const data = [{ label: 'Jan', value: 100 }];
    const result = await tool.validateBuildAndExecute(
      { data, type: 'line_chart' },
      new AbortController().signal,
    );
    expect(result.returnDisplay).toMatchObject({
      type: 'line_chart',
      data,
    });
  });
});
