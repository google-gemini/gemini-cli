/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
  MessageActionReturn,
  SubmitPromptActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import {
  getExampleRegistry,
  type Example,
  type ExampleCategory,
  type ExampleDifficulty,
} from '@google/gemini-cli-core';
import { MessageType, type HistoryItemExampleList } from '../types.js';

/**
 * List all examples or filter by category/difficulty
 */
const listCommand: SlashCommand = {
  name: 'list',
  altNames: ['ls', 'browse'],
  description: 'List all available examples',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<void> => {
    const registry = await getExampleRegistry();

    // Parse arguments for category or difficulty filter
    const argParts = args.trim().toLowerCase().split(/\s+/);
    let category: ExampleCategory | undefined;
    let difficulty: ExampleDifficulty | undefined;

    for (const part of argParts) {
      if (['beginner', 'intermediate', 'advanced'].includes(part)) {
        difficulty = part as ExampleDifficulty;
      } else if (
        [
          'code-understanding',
          'development',
          'file-operations',
          'data-analysis',
          'automation',
          'documentation',
        ].includes(part)
      ) {
        category = part as ExampleCategory;
      }
    }

    // Search with filters
    const examples = registry.search({
      category,
      difficulty,
    });

    const item: HistoryItemExampleList = {
      type: MessageType.EXAMPLE_LIST,
      examples,
      category,
      difficulty,
    };

    context.ui.addItem(item, Date.now());
  },
};

/**
 * Search examples by text query
 */
const searchCommand: SlashCommand = {
  name: 'search',
  altNames: ['find'],
  description: 'Search examples by keywords. Usage: /examples search <query>',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<SlashCommandActionReturn | void> => {
    const query = args.trim();
    if (!query) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing search query. Usage: /examples search <query>',
      };
    }

    const registry = await getExampleRegistry();
    const examples = registry.search({ text: query });

    const item: HistoryItemExampleList = {
      type: MessageType.EXAMPLE_LIST,
      examples,
      searchQuery: query,
    };

    context.ui.addItem(item, Date.now());
  },
};

/**
 * Show featured examples
 */
const featuredCommand: SlashCommand = {
  name: 'featured',
  description: 'Show featured examples for beginners',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<void> => {
    const registry = await getExampleRegistry();
    const examples = registry.search({ featuredOnly: true });

    const item: HistoryItemExampleList = {
      type: MessageType.EXAMPLE_LIST,
      examples,
      featured: true,
    };

    context.ui.addItem(item, Date.now());
  },
};

/**
 * Run an example by ID
 */
const runCommand: SlashCommand = {
  name: 'run',
  altNames: ['exec', 'execute'],
  description: 'Run an example by ID. Usage: /examples run <example-id>',
  kind: CommandKind.BUILT_IN,
  action: async (
    context,
    args,
  ): Promise<MessageActionReturn | SubmitPromptActionReturn> => {
    const exampleId = args.trim();
    if (!exampleId) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing example ID. Usage: /examples run <example-id>',
      };
    }

    const registry = await getExampleRegistry();
    const example = registry.get(exampleId);

    if (!example) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Example '${exampleId}' not found. Use /examples list to see all examples.`,
      };
    }

    // Build the complete prompt with context files if specified
    const promptParts: string[] = [];

    if (example.contextFiles && example.contextFiles.length > 0) {
      const contextRefs = example.contextFiles.map((f) => `@${f}`).join(' ');
      promptParts.push(contextRefs);
      promptParts.push('');
    }

    promptParts.push(example.examplePrompt);

    const fullPrompt = promptParts.join('\n');

    // Submit the prompt directly to the chat
    return {
      type: 'submit_prompt',
      content: fullPrompt,
    };
  },
  completion: async (context, partialArg) => {
    const registry = await getExampleRegistry();
    const examples = registry.getAll();
    return examples
      .map((ex) => ex.id)
      .filter((id) => id.startsWith(partialArg));
  },
};

/**
 * Show details of a specific example
 */
const showCommand: SlashCommand = {
  name: 'show',
  altNames: ['info', 'detail'],
  description:
    'Show details of an example by ID. Usage: /examples show <example-id>',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn | void> => {
    const exampleId = args.trim();
    if (!exampleId) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing example ID. Usage: /examples show <example-id>',
      };
    }

    const registry = await getExampleRegistry();
    const example = registry.get(exampleId);

    if (!example) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Example '${exampleId}' not found. Use /examples list to see all examples.`,
      };
    }

    // Show a single example in detail
    const item: HistoryItemExampleList = {
      type: MessageType.EXAMPLE_LIST,
      examples: [example],
      showDetails: true,
    };

    context.ui.addItem(item, Date.now());
  },
  completion: async (context, partialArg) => {
    const registry = await getExampleRegistry();
    const examples = registry.getAll();
    return examples
      .map((ex) => ex.id)
      .filter((id) => id.startsWith(partialArg));
  },
};

/**
 * Show example library statistics
 */
const statsCommand: SlashCommand = {
  name: 'stats',
  description: 'Show statistics about the example library',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const registry = await getExampleRegistry();
    const stats = registry.getStats();

    const lines: string[] = [
      '📊 Example Library Statistics',
      '',
      `Total Examples: ${stats.total}`,
      '',
      'By Category:',
    ];

    for (const [category, count] of Object.entries(stats.byCategory)) {
      lines.push(`  ${category}: ${count}`);
    }

    lines.push('');
    lines.push('By Difficulty:');
    for (const [difficulty, count] of Object.entries(stats.byDifficulty)) {
      lines.push(`  ${difficulty}: ${count}`);
    }

    return {
      type: 'message',
      messageType: 'info',
      content: lines.join('\n'),
    };
  },
};

/**
 * Get a random example
 */
const randomCommand: SlashCommand = {
  name: 'random',
  description: 'Show a random example to try',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn | void> => {
    const registry = await getExampleRegistry();
    const example = registry.getRandom();

    if (!example) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No examples available.',
      };
    }

    const item: HistoryItemExampleList = {
      type: MessageType.EXAMPLE_LIST,
      examples: [example],
      showDetails: true,
    };

    context.ui.addItem(item, Date.now());
  },
};

/**
 * Main /examples command
 */
export const examplesCommand: SlashCommand = {
  name: 'examples',
  description: 'Browse and run example prompts',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    listCommand,
    searchCommand,
    featuredCommand,
    runCommand,
    showCommand,
    statsCommand,
    randomCommand,
  ],
  action: async (context) => {
    // Default action: show featured examples
    return featuredCommand.action!(context, '');
  },
};
