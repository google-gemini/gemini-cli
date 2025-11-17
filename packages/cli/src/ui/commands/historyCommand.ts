/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import type { MessageActionReturn } from './types.js';
import { getHistoryEngine } from '@google/gemini-cli-core/history';

export const historyCommand: SlashCommand = {
  name: 'history',
  description: 'Search and manage command history with annotations',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const engine = getHistoryEngine();

    const parts = args.trim().split(/\s+/);
    const subcommand = parts[0] || 'list';

    switch (subcommand) {
      case 'list':
        return listHistory(engine, parts.slice(1).join(' '));

      case 'search':
        return searchHistory(engine, parts.slice(1).join(' '));

      case 'show':
        return showEntry(engine, parts[1]);

      case 'tag':
        return addTag(engine, parts[1], parts[2]);

      case 'untag':
        return removeTag(engine, parts[1], parts[2]);

      case 'bookmark':
        return bookmarkEntry(engine, parts[1]);

      case 'unbookmark':
        return unbookmarkEntry(engine, parts[1]);

      case 'rate':
        return rateEntry(engine, parts[1], parseInt(parts[2]));

      case 'note':
        return addNote(engine, parts[1], parts.slice(2).join(' '));

      case 'stats':
        return showStats(engine);

      case 'patterns':
        return showPatterns(engine);

      case 'export':
        return exportHistory(engine, parts[1], parts[2]);

      default:
        return {
          type: 'message',
          messageType: 'error',
          content: `Unknown command: ${subcommand}\n\nAvailable commands:\n  /history list [limit]          - List recent commands\n  /history search <query>        - Search history\n  /history show <id>             - Show entry details\n  /history tag <id> <tag>        - Add tag\n  /history untag <id> <tag>      - Remove tag\n  /history bookmark <id>         - Bookmark entry\n  /history unbookmark <id>       - Remove bookmark\n  /history rate <id> <1-5>       - Rate entry\n  /history note <id> <text>      - Add note\n  /history stats                 - Show statistics\n  /history patterns              - Detect patterns\n  /history export <format> [file]- Export history`,
        };
    }
  },
};

function listHistory(engine: any, limitStr: string): MessageActionReturn {
  const limit = parseInt(limitStr) || 20;
  const result = engine.search({ limit });

  if (result.entries.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: '📜 No command history found.',
    };
  }

  const entries = result.entries
    .map(
      (e: any) =>
        `${e.bookmarked ? '🔖 ' : ''}**${e.id}**: ${e.command} ${e.args}\n  ${new Date(e.timestamp).toLocaleString()} | ${e.status} | ${e.duration}ms${e.tags.length > 0 ? ` | ${e.tags.join(', ')}` : ''}`,
    )
    .join('\n\n');

  return {
    type: 'message',
    messageType: 'info',
    content: `📜 **Command History** (${result.entries.length}/${result.total})\n\n${entries}\n\n${result.hasMore ? `_View more: /history list ${limit + 20}_` : ''}\n_Search: /history search <query>_`,
  };
}

function searchHistory(engine: any, query: string): MessageActionReturn {
  if (!query) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please provide a search query.\n\nExample: /history search npm',
    };
  }

  const result = engine.search({ text: query, limit: 20 });

  if (result.entries.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: `No results found for: ${query}`,
    };
  }

  const entries = result.entries
    .map(
      (e: any) =>
        `**${e.id}**: ${e.command} ${e.args}\n  ${new Date(e.timestamp).toLocaleString()}`,
    )
    .join('\n\n');

  return {
    type: 'message',
    messageType: 'info',
    content: `🔍 **Search Results** (${result.entries.length}/${result.total})\n\nQuery: "${query}"\n\n${entries}`,
  };
}

function showEntry(engine: any, id: string): MessageActionReturn {
  if (!id) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify an entry ID.\n\nExample: /history show 1',
    };
  }

  const entry = engine.getEntry(id);
  if (!entry) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Entry not found: ${id}`,
    };
  }

  let content = `${entry.bookmarked ? '🔖 ' : ''}**Entry ${entry.id}**\n\n**Command:** ${entry.command} ${entry.args}\n**Date:** ${new Date(entry.timestamp).toLocaleString()}\n**Directory:** ${entry.workingDirectory}\n**Status:** ${entry.status}\n**Duration:** ${entry.duration}ms\n`;

  if (entry.tags.length > 0) {
    content += `**Tags:** ${entry.tags.join(', ')}\n`;
  }

  if (entry.rating) {
    content += `**Rating:** ${'⭐'.repeat(entry.rating)}\n`;
  }

  if (entry.notes) {
    content += `\n**Notes:**\n${entry.notes}\n`;
  }

  if (entry.output) {
    content += `\n**Output:**\n\`\`\`\n${entry.output.slice(0, 500)}${entry.output.length > 500 ? '...' : ''}\n\`\`\`\n`;
  }

  if (entry.error) {
    content += `\n**Error:**\n\`\`\`\n${entry.error}\n\`\`\``;
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

function addTag(engine: any, id: string, tag: string): MessageActionReturn {
  if (!id || !tag) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify entry ID and tag.\n\nExample: /history tag 1 important',
    };
  }

  try {
    engine.addTag(id, tag);
    return {
      type: 'message',
      messageType: 'success',
      content: `✅ Added tag "${tag}" to entry ${id}`,
    };
  } catch (error: any) {
    return {
      type: 'message',
      messageType: 'error',
      content: error.message,
    };
  }
}

function removeTag(engine: any, id: string, tag: string): MessageActionReturn {
  if (!id || !tag) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify entry ID and tag.\n\nExample: /history untag 1 important',
    };
  }

  try {
    engine.removeTag(id, tag);
    return {
      type: 'message',
      messageType: 'success',
      content: `✅ Removed tag "${tag}" from entry ${id}`,
    };
  } catch (error: any) {
    return {
      type: 'message',
      messageType: 'error',
      content: error.message,
    };
  }
}

function bookmarkEntry(engine: any, id: string): MessageActionReturn {
  if (!id) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify an entry ID.\n\nExample: /history bookmark 1',
    };
  }

  try {
    engine.bookmark(id);
    return {
      type: 'message',
      messageType: 'success',
      content: `🔖 Bookmarked entry ${id}`,
    };
  } catch (error: any) {
    return {
      type: 'message',
      messageType: 'error',
      content: error.message,
    };
  }
}

function unbookmarkEntry(engine: any, id: string): MessageActionReturn {
  if (!id) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify an entry ID.\n\nExample: /history unbookmark 1',
    };
  }

  try {
    engine.unbookmark(id);
    return {
      type: 'message',
      messageType: 'success',
      content: `✅ Removed bookmark from entry ${id}`,
    };
  } catch (error: any) {
    return {
      type: 'message',
      messageType: 'error',
      content: error.message,
    };
  }
}

function rateEntry(engine: any, id: string, rating: number): MessageActionReturn {
  if (!id || isNaN(rating)) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify entry ID and rating (1-5).\n\nExample: /history rate 1 5',
    };
  }

  try {
    engine.rate(id, rating);
    return {
      type: 'message',
      messageType: 'success',
      content: `⭐ Rated entry ${id}: ${'⭐'.repeat(rating)}`,
    };
  } catch (error: any) {
    return {
      type: 'message',
      messageType: 'error',
      content: error.message,
    };
  }
}

function addNote(engine: any, id: string, note: string): MessageActionReturn {
  if (!id || !note) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify entry ID and note text.\n\nExample: /history note 1 This worked well',
    };
  }

  try {
    engine.addNote(id, note);
    return {
      type: 'message',
      messageType: 'success',
      content: `📝 Added note to entry ${id}`,
    };
  } catch (error: any) {
    return {
      type: 'message',
      messageType: 'error',
      content: error.message,
    };
  }
}

function showStats(engine: any): MessageActionReturn {
  const stats = engine.getStats();

  const topCommands = stats.topCommands
    .slice(0, 5)
    .map((c: any) => `  ${c.command}: ${c.count}`)
    .join('\n');

  const topTags = stats.topTags
    .slice(0, 5)
    .map((t: any) => `  ${t.tag}: ${t.count}`)
    .join('\n');

  return {
    type: 'message',
    messageType: 'info',
    content: `📊 **Command History Statistics**\n\n**Overview:**\n- Total commands: ${stats.totalCommands}\n- Success rate: ${stats.successRate.toFixed(1)}%\n- Average duration: ${stats.averageDuration.toFixed(0)}ms\n- Total time: ${Math.round(stats.totalDuration / 1000)}s\n\n**Status:**\n- Successful: ${stats.successCount}\n- Errors: ${stats.errorCount}\n- Cancelled: ${stats.cancelledCount}\n\n**Annotations:**\n- Bookmarked: ${stats.bookmarkedCount}\n- Tagged: ${stats.taggedCount}\n- With notes: ${stats.annotatedCount}\n\n**Top Commands:**\n${topCommands || '  None'}\n\n**Top Tags:**\n${topTags || '  None'}`,
  };
}

function showPatterns(engine: any): MessageActionReturn {
  const patterns = engine.detectPatterns().slice(0, 10);

  if (patterns.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: '📈 No patterns detected yet.',
    };
  }

  const list = patterns
    .map(
      (p: any) =>
        `**${p.pattern}**\n  Frequency: ${p.frequency}\n  Avg duration: ${p.avgDuration.toFixed(0)}ms\n  Success rate: ${p.successRate.toFixed(1)}%\n  Last used: ${new Date(p.lastUsed).toLocaleString()}`,
    )
    .join('\n\n');

  return {
    type: 'message',
    messageType: 'info',
    content: `📈 **Command Patterns** (Top 10)\n\n${list}`,
  };
}

function exportHistory(
  engine: any,
  format: string,
  filename?: string,
): MessageActionReturn {
  const validFormats = ['json', 'csv', 'markdown'];
  if (!format || !validFormats.includes(format)) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Please specify a valid format: ${validFormats.join(', ')}\n\nExample: /history export json history.json`,
    };
  }

  try {
    const data = engine.export({
      format,
      includeOutput: true,
      includeNotes: true,
    });

    const fileName = filename || `history.${format}`;

    // In production, this would save the file
    // For now, just return the first part of the data
    const preview = data.slice(0, 500) + (data.length > 500 ? '...' : '');

    return {
      type: 'message',
      messageType: 'success',
      content: `📤 **Exported to ${format}**\n\nPreview:\n\`\`\`\n${preview}\n\`\`\`\n\n_Full export would be saved to: ${fileName}_`,
    };
  } catch (error: any) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Export failed: ${error.message}`,
    };
  }
}
