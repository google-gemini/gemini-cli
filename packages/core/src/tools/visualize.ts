/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { ToolInvocation, ToolResult } from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ToolErrorType } from './tool-error.js';

interface VisualizeParams {
  data: unknown;
  type?: 'table' | 'bar_chart' | 'pie_chart' | 'line_chart' | 'diff';
  title?: string;
  save_as?: string;
  open?: boolean;
}

class VisualizeInvocation extends BaseToolInvocation<
  VisualizeParams,
  ToolResult
> {
  getDescription(): string {
    const type = this.params.type ?? 'table';
    const action = this.params.save_as
      ? `and saving to ${this.params.save_as}`
      : '';
    return `Visualizing data as ${type} ${action}`;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const { data, type = 'table', title, save_as } = this.params;

    if (
      type === 'table' ||
      type === 'bar_chart' ||
      type === 'pie_chart' ||
      type === 'line_chart'
    ) {
      if (!Array.isArray(data)) {
        return {
          llmContent:
            'Error: data must be an array of objects for this visualization type.',
          returnDisplay:
            'Error: data must be an array of objects for this visualization type.',
          error: {
            message: 'Data must be an array',
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
        };
      }
    } else if (type === 'diff') {
      if (typeof data !== 'object' || !data) {
        return {
          llmContent: 'Error: data must be an object for diff visualization.',
          returnDisplay:
            'Error: data must be an object for diff visualization.',
          error: {
            message: 'Data must be an object',
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
        };
      }
    }

    let savedFilePath: string | undefined;

    if (save_as) {
      try {
        const absolutePath = path.resolve(save_as);
        let content = '';
        if (save_as.endsWith('.json')) {
          content = JSON.stringify(data, null, 2);
        } else if (save_as.endsWith('.csv') && Array.isArray(data)) {
          // Basic CSV conversion
          if (data.length > 0 && typeof data[0] === 'object') {
            const headers = Object.keys(data[0] as object).join(',');
            const rows = data
              .map((row) =>
                Object.values(row as object)
                  .map((v) => {
                    const s = String(v);
                    // Quote if contains comma or newline
                    if (
                      s.includes(',') ||
                      s.includes('\n') ||
                      s.includes('"')
                    ) {
                      return `"${s.replace(/"/g, '""')}"`;
                    }
                    return s;
                  })
                  .join(','),
              )
              .join('\n');
            content = `${headers}\n${rows}`;
          } else {
            content = '';
          }
        } else {
          content = JSON.stringify(data, null, 2);
        }

        await fs.writeFile(absolutePath, content);
        savedFilePath = absolutePath;
      } catch (e) {
        return {
          llmContent: `Error saving file: ${e}`,
          returnDisplay: `Error saving file: ${e}`,
          error: {
            message: `Error saving file: ${e}`,
            type: ToolErrorType.EXECUTION_FAILED,
          },
        };
      }
    }

    // Infer columns for table
    let columns;
    if (
      type === 'table' &&
      Array.isArray(data) &&
      data.length > 0 &&
      typeof data[0] === 'object'
    ) {
      columns = Object.keys(data[0] as object).map((key) => ({
        key,
        label: key,
      }));
    }

    return {
      llmContent:
        'Visualization rendered in CLI.' +
        (savedFilePath ? ` Saved to ${savedFilePath}` : ''),
      returnDisplay: {
        type,
        title,
        data,
        columns,
        savedFilePath,
      },
    };
  }
}

export class VisualizeTool extends BaseDeclarativeTool<
  VisualizeParams,
  ToolResult
> {
  constructor(messageBus: MessageBus) {
    super(
      'visualize',
      'Visualize Data',
      'Renders structured data as tables, charts, or diffs, and optionally saves it to a file.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          data: {
            description:
              'The structured data to visualize. Array of objects for tables/charts. For diffs, provide an object with {fileDiff: string}, {old: string, new: string}, or {oldContent: string, newContent: string}. Can also be a string containing a unified diff.',
          },
          type: {
            type: 'string',
            enum: ['table', 'bar_chart', 'pie_chart', 'line_chart', 'diff'],
            description: 'The visualization type. Default: table.',
          },
          title: {
            type: 'string',
            description: 'A title for the visualization.',
          },
          save_as: {
            type: 'string',
            description:
              'File path to save the data (e.g. data.csv, data.json).',
          },
        },
        required: ['data'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: VisualizeParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<VisualizeParams, ToolResult> {
    return new VisualizeInvocation(
      params,
      messageBus,
      toolName ?? this.name,
      toolDisplayName ?? this.displayName,
    );
  }
}
