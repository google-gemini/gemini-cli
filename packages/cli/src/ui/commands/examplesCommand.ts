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
  getExampleHistory,
  injectContext,
  extractVariables,
  validateVariables,
  parseVariablesFromArgs,
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
 * Run an example by ID with optional variable substitution
 */
const runCommand: SlashCommand = {
  name: 'run',
  altNames: ['exec', 'execute'],
  description:
    'Run an example by ID with optional variables. Usage: /examples run <example-id> [var1=value1 var2=value2]',
  kind: CommandKind.BUILT_IN,
  action: async (
    context,
    args,
  ): Promise<MessageActionReturn | SubmitPromptActionReturn> => {
    const parts = args.trim().split(/\s+/);
    const exampleId = parts[0];

    if (!exampleId) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Missing example ID. Usage: /examples run <example-id> [var1=value1 ...]',
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

    // Parse variables from remaining arguments
    const variablesArgs = parts.slice(1).join(' ');
    const variables = parseVariablesFromArgs(variablesArgs);

    // Validate variables
    const validation = validateVariables(example, variables);
    if (!validation.valid) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Missing required variables: ${validation.missing.join(', ')}\n\nExample prompt uses: ${extractVariables(example.examplePrompt).map((v) => `{{${v}}}`).join(', ')}`,
      };
    }

    // Inject context and variables
    const injected = injectContext(example, {
      variables,
      includeDefaultFiles: true,
    });

    // Record execution in history
    const history = getExampleHistory();
    history.record({
      exampleId: example.id,
      timestamp: Date.now(),
      action: 'run',
      contextVars: variables,
    });

    // Submit the prompt directly to the chat
    return {
      type: 'submit_prompt',
      content: injected.prompt,
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
 * Preview an example without running it
 */
const previewCommand: SlashCommand = {
  name: 'preview',
  description:
    'Preview an example with context injection. Usage: /examples preview <example-id> [var1=value1 ...]',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const parts = args.trim().split(/\s+/);
    const exampleId = parts[0];

    if (!exampleId) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Missing example ID. Usage: /examples preview <example-id> [var1=value1 ...]',
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

    // Parse variables from remaining arguments
    const variablesArgs = parts.slice(1).join(' ');
    const variables = parseVariablesFromArgs(variablesArgs);

    // Get required variables
    const requiredVars = extractVariables(example.examplePrompt);

    // Inject context
    const injected = injectContext(example, {
      variables,
      includeDefaultFiles: true,
    });

    // Build preview message
    const lines: string[] = [
      `📋 Preview: ${example.title}`,
      '',
      `**Category:** ${example.category}`,
      `**Difficulty:** ${example.difficulty}`,
      `**Estimated Time:** ${example.estimatedTime}`,
    ];

    if (requiredVars.length > 0) {
      lines.push('');
      lines.push('**Variables:**');
      for (const varName of requiredVars) {
        const value = variables[varName] || '<not provided>';
        lines.push(`  {{${varName}}} = ${value}`);
      }
    }

    if (injected.contextFiles.length > 0) {
      lines.push('');
      lines.push('**Context Files:**');
      for (const file of injected.contextFiles) {
        lines.push(`  @${file}`);
      }
    }

    lines.push('');
    lines.push('**Prompt:**');
    lines.push('```');
    lines.push(injected.prompt);
    lines.push('```');

    lines.push('');
    lines.push(`*Run with:* /examples run ${exampleId}`);

    // Record preview in history
    const history = getExampleHistory();
    history.record({
      exampleId: example.id,
      timestamp: Date.now(),
      action: 'preview',
      contextVars: variables,
    });

    return {
      type: 'message',
      messageType: 'info',
      content: lines.join('\n'),
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
 * Show example execution history
 */
const historyCommand: SlashCommand = {
  name: 'history',
  description: 'Show recent example execution history',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const history = getExampleHistory();
    const limit = args.trim() ? parseInt(args.trim(), 10) : 20;
    const recent = history.getRecent(limit);

    if (recent.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content:
          'No example history yet. Run an example with /examples run <id> to get started.',
      };
    }

    const stats = history.getStats();
    const lines: string[] = [
      '📊 Example Execution History',
      '',
      `Total Runs: ${stats.totalRuns}`,
      `Total Previews: ${stats.totalPreviews}`,
      '',
      'Recent Activity:',
    ];

    for (const entry of recent.slice(0, limit)) {
      const date = new Date(entry.timestamp);
      const timeStr = date.toLocaleString();
      const action = entry.action === 'run' ? '▶️' : entry.action === 'preview' ? '👁️' : '💾';
      const vars = entry.contextVars
        ? ` (${Object.keys(entry.contextVars).length} vars)`
        : '';
      lines.push(`  ${action} ${entry.exampleId}${vars} - ${timeStr}`);
    }

    if (stats.popularExamples.length > 0) {
      lines.push('');
      lines.push('Most Popular:');
      for (const { exampleId, runCount } of stats.popularExamples.slice(0, 5)) {
        lines.push(`  ${exampleId} (${runCount} runs)`);
      }
    }

    return {
      type: 'message',
      messageType: 'info',
      content: lines.join('\n'),
    };
  },
};

/**
 * Save an example as a custom slash command
 */
const saveCommand: SlashCommand = {
  name: 'save',
  description:
    'Save an example as a custom command. Usage: /examples save <example-id> [command-name]',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const parts = args.trim().split(/\s+/);
    const exampleId = parts[0];
    const commandName = parts[1] || exampleId;

    if (!exampleId) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Missing example ID. Usage: /examples save <example-id> [command-name]',
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

    // Record save in history
    const history = getExampleHistory();
    history.record({
      exampleId: example.id,
      timestamp: Date.now(),
      action: 'save',
      notes: commandName,
    });

    // Build the command file content
    const commandContent = [
      `# ${example.title}`,
      '',
      `# ${example.description}`,
      '',
      `# Category: ${example.category}`,
      `# Difficulty: ${example.difficulty}`,
      `# Estimated Time: ${example.estimatedTime}`,
      '',
    ];

    if (example.contextFiles && example.contextFiles.length > 0) {
      commandContent.push(...example.contextFiles.map((f) => `@${f}`));
      commandContent.push('');
    }

    commandContent.push(example.examplePrompt);

    const message = [
      `✅ Example saved as custom command!`,
      '',
      `Create a file at: \`.claude/commands/${commandName}.md\``,
      '',
      'With this content:',
      '```markdown',
      ...commandContent,
      '```',
      '',
      `Then run it with: /${commandName}`,
      '',
      '**Note:** You\'ll need to reload commands with /reload or restart the CLI.',
    ];

    return {
      type: 'message',
      messageType: 'info',
      content: message.join('\n'),
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
 * Main /examples command
 */
export const examplesCommand: SlashCommand = {
  name: 'examples',
  description: 'Browse and run example prompts with advanced features',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    listCommand,
    searchCommand,
    featuredCommand,
    runCommand,
    previewCommand,
    showCommand,
    historyCommand,
    saveCommand,
    statsCommand,
    randomCommand,
  ],
  action: async (context) => {
    // Default action: show featured examples
    return featuredCommand.action!(context, '');
  },
};
