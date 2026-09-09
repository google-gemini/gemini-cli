/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, type vi } from 'vitest';
import { toolsCommand } from './toolsCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import type { ToolBuilder, ToolResult } from '@google/gemini-cli-core';

// Mock tools for testing
const mockTools = [
  {
    name: 'file-reader',
    displayName: 'File Reader',
    description: 'Reads files from the local system.',
    schema: {},
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
        agentContext: {
          toolRegistry: undefined,
        },
      },
    });

    if (!toolsCommand.action) throw new Error('Action not defined');
    await toolsCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.ERROR,
      text: 'Could not retrieve tool registry.',
    });
  });

  it('should display "No tools available" when none are found', async () => {
    const mockContext = createMockCommandContext({
      services: {
        agentContext: {
          toolRegistry: {
            getAllTools: () => [] as Array<ToolBuilder<object, ToolResult>>,
          },
        },
      },
    });

    if (!toolsCommand.action) throw new Error('Action not defined');
    await toolsCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.TOOLS_LIST,
      tools: [],
      showDescriptions: false,
    });
  });

  it('should list tools without descriptions by default (no args)', async () => {
    const mockContext = createMockCommandContext({
      services: {
        agentContext: {
          toolRegistry: { getAllTools: () => mockTools },
        },
      },
    });

    if (!toolsCommand.action) throw new Error('Action not defined');
    await toolsCommand.action(mockContext, '');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(message.type).toBe(MessageType.TOOLS_LIST);
    expect(message.showDescriptions).toBe(false);
    expect(message.tools).toHaveLength(2);
    expect(message.tools[0].displayName).toBe('File Reader');
    expect(message.tools[1].displayName).toBe('Code Editor');
  });

  it('should list tools without descriptions when "list" arg is passed', async () => {
    const mockContext = createMockCommandContext({
      services: {
        agentContext: {
          toolRegistry: { getAllTools: () => mockTools },
        },
      },
    });

    if (!toolsCommand.action) throw new Error('Action not defined');
    await toolsCommand.action(mockContext, 'list');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(message.type).toBe(MessageType.TOOLS_LIST);
    expect(message.showDescriptions).toBe(false);
    expect(message.tools).toHaveLength(2);
    expect(message.tools[0].displayName).toBe('File Reader');
    expect(message.tools[1].displayName).toBe('Code Editor');
  });

  it('should list tools with descriptions when "desc" arg is passed', async () => {
    const mockContext = createMockCommandContext({
      services: {
        agentContext: {
          toolRegistry: { getAllTools: () => mockTools },
        },
      },
    });

    if (!toolsCommand.action) throw new Error('Action not defined');
    await toolsCommand.action(mockContext, 'desc');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(message.type).toBe(MessageType.TOOLS_LIST);
    expect(message.showDescriptions).toBe(true);
    expect(message.tools).toHaveLength(2);
    expect(message.tools[0].displayName).toBe('File Reader');
    expect(message.tools[0].description).toBe(
      'Reads files from the local system.',
    );
    expect(message.tools[1].displayName).toBe('Code Editor');
    expect(message.tools[1].description).toBe('Edits code files.');
  });

  it('should have "list" and "desc" subcommands', () => {
    expect(toolsCommand.subCommands).toBeDefined();
    const names = toolsCommand.subCommands?.map((s) => s.name);
    expect(names).toContain('list');
    expect(names).toContain('desc');
    expect(names).not.toContain('descriptions');
  });

  it('subcommand "list" should display tools without descriptions', async () => {
    const mockContext = createMockCommandContext({
      services: {
        agentContext: {
          toolRegistry: { getAllTools: () => mockTools },
        },
      },
    });

    const listCmd = toolsCommand.subCommands?.find((s) => s.name === 'list');
    if (!listCmd?.action) throw new Error('Action not defined');
    await listCmd.action(mockContext, '');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(message.showDescriptions).toBe(false);
    expect(message.tools).toHaveLength(2);
    expect(message.tools[0].displayName).toBe('File Reader');
    expect(message.tools[1].displayName).toBe('Code Editor');
  });

  it('subcommand "desc" should display tools with descriptions', async () => {
    const mockContext = createMockCommandContext({
      services: {
        agentContext: {
          toolRegistry: { getAllTools: () => mockTools },
        },
      },
    });

    const descCmd = toolsCommand.subCommands?.find((s) => s.name === 'desc');
    if (!descCmd?.action) throw new Error('Action not defined');
    await descCmd.action(mockContext, '');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(message.showDescriptions).toBe(true);
    expect(message.tools).toHaveLength(2);
    expect(message.tools[0].displayName).toBe('File Reader');
    expect(message.tools[0].description).toBe(
      'Reads files from the local system.',
    );
    expect(message.tools[1].displayName).toBe('Code Editor');
    expect(message.tools[1].description).toBe('Edits code files.');
  });

  it('should expose a desc subcommand for TUI discoverability', async () => {
    const descSubCommand = toolsCommand.subCommands?.find(
      (cmd) => cmd.name === 'desc',
    );
    expect(descSubCommand).toBeDefined();
    expect(descSubCommand?.description).toContain('descriptions');

    const mockContext = createMockCommandContext({
      services: {
        agentContext: {
          toolRegistry: { getAllTools: () => mockTools },
        },
      },
    });

    if (!descSubCommand?.action) throw new Error('Action not defined');
    await descSubCommand.action(mockContext, '');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(message.type).toBe(MessageType.TOOLS_LIST);
    expect(message.showDescriptions).toBe(true);
  });
});
