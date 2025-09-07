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
import type { Tool } from '@google/gemini-cli-core';
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
] as Tool[];

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
          getToolRegistry: () => ({ getAllTools: () => [] as Tool[] }),
        },
      },
    });

    if (!toolsCommand.action) throw new Error('Action not defined');
    await toolsCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('No tools available'),
      }),
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

    const message = (mockContext.ui.addItem as vi.Mock).mock.calls[0][0].text;
    expect(message).not.toContain('Reads files from the local system.');
    expect(message).not.toContain('Parameters:');
    expect(message).toContain('File Reader');
    expect(message).toContain('Code Editor');
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

    const message = (mockContext.ui.addItem as vi.Mock).mock.calls[0][0].text;
    expect(message).toContain('Reads files from the local system.');
    expect(message).toContain('Edits code files.');
    expect(message).not.toContain('Parameters:');
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

    const message = (mockContext.ui.addItem as vi.Mock).mock.calls[0][0].text;
    expect(message).toContain('Parameters:');
    expect(message).toContain('path');
    expect(message).toContain('STRING');
    expect(message).toContain('Reads files from the local system.');
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

    const message = (mockContext.ui.addItem as vi.Mock).mock.calls[0][0].text;
    // Ensure the tool with schema shows its schema
    expect(message).toContain('File Reader');
    expect(message).toContain('Parameters:');
    expect(message).toContain('path');

    // Ensure the tool without a schema does not cause an error and is still displayed
    expect(message).toContain('Code Editor');
    // A simple way to check that no schema is printed for the second tool
    const parts = message.split('Code Editor');
    expect(parts[1]).not.toContain('Parameters:');
  });
});
