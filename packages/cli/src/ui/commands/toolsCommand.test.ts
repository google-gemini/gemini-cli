/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { vi } from 'vitest';
import { describe, it, expect } from 'vitest';
import { toolsCommand } from './toolsCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import type { ToolBuilder, ToolResult } from '@google/gemini-cli-core';
import { Type } from '@google/genai';

// Mock tools for testing
const mockToolsWithSchema = [
  {
    name: 'file-reader',
    displayName: 'File Reader',
    description: 'Reads files from the local system.',
    schema: {
      parameters: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING, description: 'Path to the file' },
        },
        required: ['path'],
      },
    },
  },
  {
    name: 'code-editor',
    displayName: 'Code Editor',
    description: 'Edits code files.',
    schema: {},
  },
] as unknown as Array<ToolBuilder<object, ToolResult>>;

describe('toolsCommand', () => {
  it('should display an error if the tool registry is unavailable', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getToolRegistry: () => undefined,
        },
      },
    });

    if (!toolsCommand.action) throw new Error('Action not defined');
    await toolsCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.ERROR,
        text: 'Could not retrieve tool registry.',
      },
      expect.any(Number),
    );
  });

  it('should display "No tools available" when none are found', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getToolRegistry: () => ({
            getAllTools: () => [] as Array<ToolBuilder<object, ToolResult>>,
          }),
        },
      },
    });

    if (!toolsCommand.action) throw new Error('Action not defined');
    await toolsCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.TOOLS_LIST,
        tools: [],
        showDescriptions: false,
        showSchema: false,
      },
      expect.any(Number),
    );
  });

  it('should list tools without descriptions or schemas by default', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getToolRegistry: () => ({ getAllTools: () => mockToolsWithSchema }),
        },
      },
    });

    if (!toolsCommand.action) throw new Error('Action not defined');
    await toolsCommand.action(mockContext, '');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(message.type).toBe(MessageType.TOOLS_LIST);
    expect(message.showDescriptions).toBe(false);
    expect(message.showSchema).toBe(false);
    expect(message.tools).toHaveLength(2);
    expect(message.tools[0].displayName).toBe('File Reader');
    expect(message.tools[1].displayName).toBe('Code Editor');
  });

  it('should list tools with descriptions when "desc" arg is passed', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getToolRegistry: () => ({ getAllTools: () => mockToolsWithSchema }),
        },
      },
    });

    if (!toolsCommand.action) throw new Error('Action not defined');
    await toolsCommand.action(mockContext, 'desc');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(message.type).toBe(MessageType.TOOLS_LIST);
    expect(message.showDescriptions).toBe(true);
    expect(message.showSchema).toBe(false);
    expect(message.tools).toHaveLength(2);
    expect(message.tools[0].description).toBe(
      'Reads files from the local system.',
    );
    expect(message.tools[1].description).toBe('Edits code files.');
  });

  it('should list tools with descriptions and schemas when "schema" arg is passed', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getToolRegistry: () => ({ getAllTools: () => mockToolsWithSchema }),
        },
      },
    });

    if (!toolsCommand.action) throw new Error('Action not defined');
    await toolsCommand.action(mockContext, 'schema');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(message.type).toBe(MessageType.TOOLS_LIST);
    expect(message.showDescriptions).toBe(true);
    expect(message.showSchema).toBe(true);
    expect(message.tools).toHaveLength(2);
    expect(message.tools[0].description).toBe(
      'Reads files from the local system.',
    );
    expect(message.tools[0].schema).toBeDefined();
    expect(
      (
        message.tools[0].schema as {
          parameters: { properties: { path: { type: string } } };
        }
      ).parameters.properties.path.type,
    ).toBe(Type.STRING);
  });

  it('should handle tools without schemas gracefully when "schema" is passed', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getToolRegistry: () => ({ getAllTools: () => mockToolsWithSchema }),
        },
      },
    });

    if (!toolsCommand.action) throw new Error('Action not defined');
    await toolsCommand.action(mockContext, 'schema');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(message.type).toBe(MessageType.TOOLS_LIST);
    expect(message.showDescriptions).toBe(true);
    expect(message.showSchema).toBe(true);
    expect(message.tools).toHaveLength(2);

    // Ensure the tool with schema shows its schema
    expect(message.tools[0].displayName).toBe('File Reader');
    expect(message.tools[0].schema).toBeDefined();

    // Ensure the tool without a schema does not cause an error and is still displayed
    expect(message.tools[1].displayName).toBe('Code Editor');
    expect(message.tools[1].schema).toEqual({});
  });
});
