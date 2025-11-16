/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { examplesCommand } from './examplesCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

// Mock the example registry
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  const mockExamples = [
    {
      id: 'test-example-1',
      title: 'Test Example 1',
      description: 'A test example',
      category: 'development',
      difficulty: 'beginner',
      estimatedTime: '5 minutes',
      tags: ['test', 'example'],
      requiredTools: [],
      requiredPermissions: [],
      examplePrompt: 'Test prompt',
      expectedOutcome: 'Test outcome',
      tips: ['Tip 1'],
      relatedExamples: [],
      documentationLinks: [],
      featured: true,
    },
    {
      id: 'test-example-2',
      title: 'Test Example 2',
      description: 'Another test example',
      category: 'file-operations',
      difficulty: 'intermediate',
      estimatedTime: '10 minutes',
      tags: ['advanced'],
      requiredTools: [],
      requiredPermissions: [],
      examplePrompt: 'Another test prompt',
      expectedOutcome: 'Another test outcome',
      tips: [],
      relatedExamples: [],
      documentationLinks: [],
    },
  ];

  const mockRegistry = {
    search: vi.fn().mockReturnValue(mockExamples),
    get: vi.fn((id: string) =>
      mockExamples.find((ex) => ex.id === id),
    ),
    getAll: vi.fn().mockReturnValue(mockExamples),
    getRandom: vi.fn().mockReturnValue(mockExamples[0]),
    getStats: vi.fn().mockReturnValue({
      total: 2,
      byCategory: {
        'code-understanding': 0,
        development: 1,
        'file-operations': 1,
        'data-analysis': 0,
        automation: 0,
        documentation: 0,
      },
      byDifficulty: {
        beginner: 1,
        intermediate: 1,
        advanced: 0,
      },
      mostPopular: [],
      recentlyAdded: [],
    }),
  };

  return {
    ...actual,
    getExampleRegistry: vi.fn().mockResolvedValue(mockRegistry),
  };
});

describe('examplesCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext({
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext);
  });

  it('should have the correct name and description', () => {
    expect(examplesCommand.name).toBe('examples');
    expect(examplesCommand.description).toBe('Browse and run example prompts');
  });

  it('should have subcommands', () => {
    expect(examplesCommand.subCommands).toBeDefined();
    expect(examplesCommand.subCommands!.length).toBeGreaterThan(0);
  });

  it('should show featured examples by default', async () => {
    if (!examplesCommand.action) {
      throw new Error('The examples command must have an action.');
    }

    await examplesCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.EXAMPLE_LIST,
        featured: true,
      }),
      expect.any(Number),
    );
  });

  describe('list subcommand', () => {
    it('should list all examples', async () => {
      const listCommand = examplesCommand.subCommands!.find(
        (cmd) => cmd.name === 'list',
      );
      expect(listCommand).toBeDefined();

      if (!listCommand?.action) {
        throw new Error('List command must have an action.');
      }

      await listCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.EXAMPLE_LIST,
        }),
        expect.any(Number),
      );
    });
  });

  describe('search subcommand', () => {
    it('should search examples by query', async () => {
      const searchCommand = examplesCommand.subCommands!.find(
        (cmd) => cmd.name === 'search',
      );
      expect(searchCommand).toBeDefined();

      if (!searchCommand?.action) {
        throw new Error('Search command must have an action.');
      }

      await searchCommand.action(mockContext, 'test');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.EXAMPLE_LIST,
          searchQuery: 'test',
        }),
        expect.any(Number),
      );
    });

    it('should return error for empty query', async () => {
      const searchCommand = examplesCommand.subCommands!.find(
        (cmd) => cmd.name === 'search',
      );

      if (!searchCommand?.action) {
        throw new Error('Search command must have an action.');
      }

      const result = await searchCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Missing search query. Usage: /examples search <query>',
      });
    });
  });

  describe('run subcommand', () => {
    it('should run an example by ID', async () => {
      const runCommand = examplesCommand.subCommands!.find(
        (cmd) => cmd.name === 'run',
      );
      expect(runCommand).toBeDefined();

      if (!runCommand?.action) {
        throw new Error('Run command must have an action.');
      }

      const result = await runCommand.action(mockContext, 'test-example-1');

      expect(result).toEqual({
        type: 'submit_prompt',
        content: 'Test prompt',
      });
    });

    it('should return error for missing example ID', async () => {
      const runCommand = examplesCommand.subCommands!.find(
        (cmd) => cmd.name === 'run',
      );

      if (!runCommand?.action) {
        throw new Error('Run command must have an action.');
      }

      const result = await runCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Missing example ID. Usage: /examples run <example-id>',
      });
    });

    it('should return error for non-existent example', async () => {
      const runCommand = examplesCommand.subCommands!.find(
        (cmd) => cmd.name === 'run',
      );

      if (!runCommand?.action) {
        throw new Error('Run command must have an action.');
      }

      const result = await runCommand.action(
        mockContext,
        'non-existent-example',
      );

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content:
          "Example 'non-existent-example' not found. Use /examples list to see all examples.",
      });
    });

    it('should provide completion suggestions', async () => {
      const runCommand = examplesCommand.subCommands!.find(
        (cmd) => cmd.name === 'run',
      );

      if (!runCommand?.completion) {
        throw new Error('Run command must have completion.');
      }

      const suggestions = await runCommand.completion(mockContext, 'test');

      expect(suggestions).toContain('test-example-1');
      expect(suggestions).toContain('test-example-2');
    });
  });

  describe('show subcommand', () => {
    it('should show example details', async () => {
      const showCommand = examplesCommand.subCommands!.find(
        (cmd) => cmd.name === 'show',
      );
      expect(showCommand).toBeDefined();

      if (!showCommand?.action) {
        throw new Error('Show command must have an action.');
      }

      await showCommand.action(mockContext, 'test-example-1');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.EXAMPLE_LIST,
          showDetails: true,
        }),
        expect.any(Number),
      );
    });

    it('should return error for missing example ID', async () => {
      const showCommand = examplesCommand.subCommands!.find(
        (cmd) => cmd.name === 'show',
      );

      if (!showCommand?.action) {
        throw new Error('Show command must have an action.');
      }

      const result = await showCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Missing example ID. Usage: /examples show <example-id>',
      });
    });
  });

  describe('stats subcommand', () => {
    it('should show library statistics', async () => {
      const statsCommand = examplesCommand.subCommands!.find(
        (cmd) => cmd.name === 'stats',
      );
      expect(statsCommand).toBeDefined();

      if (!statsCommand?.action) {
        throw new Error('Stats command must have an action.');
      }

      const result = await statsCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Example Library Statistics'),
      });
    });
  });

  describe('random subcommand', () => {
    it('should show a random example', async () => {
      const randomCommand = examplesCommand.subCommands!.find(
        (cmd) => cmd.name === 'random',
      );
      expect(randomCommand).toBeDefined();

      if (!randomCommand?.action) {
        throw new Error('Random command must have an action.');
      }

      await randomCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.EXAMPLE_LIST,
          showDetails: true,
        }),
        expect.any(Number),
      );
    });
  });
});
