/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { ContextDisplay } from './ContextDisplay.js';
import type { HistoryItemContext } from '../types.js';

describe('<ContextDisplay />', () => {
  beforeAll(() => {
    vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (
      this: number,
    ) {
      // Use a stable 'en-US' format for test consistency.
      return new Intl.NumberFormat('en-US').format(this);
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('should display error message when breakdown is null', () => {
    const item: HistoryItemContext = {
      type: 'context',
      breakdown: null,
    };

    const { lastFrame } = render(<ContextDisplay item={item} />);

    expect(lastFrame()).toContain('Unable to gather context information');
  });

  it('should display context usage with all sections', () => {
    const item: HistoryItemContext = {
      type: 'context',
      breakdown: {
        model: 'gemini-2.5-pro',
        currentTokens: 60000,
        maxTokens: 200000,
        systemPromptTokens: 2900,
        toolsTokens: 13300,
        mcpToolsTokens: 16800,
        memoryTokens: 27000,
        messagesTokens: 8,
        mcpTools: [
          { name: 'mcp__ide__getDiagnostics', server: 'ide', tokens: 428 },
          { name: 'mcp__ide__executeCode', server: 'ide', tokens: 499 },
        ],
        memoryFiles: [
          { path: '/project/CLAUDE.local.md', tokens: 584 },
          { path: '/project/memory.md', tokens: 2200 },
        ],
        slashCommands: 681,
      },
    };

    const { lastFrame } = render(<ContextDisplay item={item} />);

    const output = lastFrame();

    // Check header
    expect(output).toContain('Context Usage');

    // Check model and token info
    expect(output).toContain('gemini-2.5-pro');
    expect(output).toContain('60.0k/200.0k tokens');
    expect(output).toContain('30%');

    // Check breakdown sections
    expect(output).toContain('System prompt:');
    expect(output).toContain('2.9k tokens');

    expect(output).toContain('System tools:');
    expect(output).toContain('13.3k tokens');

    expect(output).toContain('MCP tools:');
    expect(output).toContain('16.8k tokens');

    expect(output).toContain('Memory files:');
    expect(output).toContain('27.0k tokens');

    expect(output).toContain('Messages:');

    expect(output).toContain('Free space:');
    expect(output).toContain('140.0k');
    expect(output).toContain('70.0%');
  });

  it('should display MCP tools section with server grouping', () => {
    const item: HistoryItemContext = {
      type: 'context',
      breakdown: {
        model: 'gemini-2.5-pro',
        currentTokens: 5000,
        maxTokens: 1000000,
        systemPromptTokens: 500,
        toolsTokens: 2000,
        mcpToolsTokens: 1500,
        memoryTokens: 500,
        messagesTokens: 500,
        mcpTools: [
          { name: 'mcp__ide__getDiagnostics', server: 'ide', tokens: 750 },
          {
            name: 'mcp__playwright__browserClose',
            server: 'playwright',
            tokens: 390,
          },
        ],
        memoryFiles: [],
        slashCommands: 0,
      },
    };

    const { lastFrame } = render(<ContextDisplay item={item} />);

    const output = lastFrame();

    // Check MCP tools section header
    expect(output).toContain('MCP tools');
    expect(output).toContain('/ide');
    expect(output).toContain('/playwright');

    // Check individual tools
    expect(output).toContain('ide_getDiagnostics');
    expect(output).toContain('(ide):');
    expect(output).toContain('750 tokens');

    expect(output).toContain('playwright_browserClose');
    expect(output).toContain('(playwright):');
    expect(output).toContain('390 tokens');
  });

  it('should display memory files section', () => {
    const item: HistoryItemContext = {
      type: 'context',
      breakdown: {
        model: 'gemini-2.5-pro',
        currentTokens: 5000,
        maxTokens: 1000000,
        systemPromptTokens: 500,
        toolsTokens: 2000,
        mcpToolsTokens: 0,
        memoryTokens: 2000,
        messagesTokens: 500,
        mcpTools: [],
        memoryFiles: [
          { path: '/project/memory.md', tokens: 1000 },
          { path: '/project/notes.md', tokens: 1000 },
        ],
        slashCommands: 0,
      },
    };

    const { lastFrame } = render(<ContextDisplay item={item} />);

    const output = lastFrame();

    // Check memory files section
    expect(output).toContain('Memory files');
    expect(output).toContain('/memory');
    expect(output).toContain('/project/memory.md:');
    expect(output).toContain('/project/notes.md:');
    expect(output).toContain('1000 tokens');
  });

  it('should display slash commands section when present', () => {
    const item: HistoryItemContext = {
      type: 'context',
      breakdown: {
        model: 'gemini-2.5-pro',
        currentTokens: 5000,
        maxTokens: 1000000,
        systemPromptTokens: 500,
        toolsTokens: 2000,
        mcpToolsTokens: 0,
        memoryTokens: 0,
        messagesTokens: 500,
        mcpTools: [],
        memoryFiles: [],
        slashCommands: 681,
      },
    };

    const { lastFrame } = render(<ContextDisplay item={item} />);

    const output = lastFrame();

    expect(output).toContain('SlashCommand Tool');
    expect(output).toContain('681 commands');
    expect(output).toContain('Total: 681 tokens');
  });

  it('should not display sections with zero tokens', () => {
    const item: HistoryItemContext = {
      type: 'context',
      breakdown: {
        model: 'gemini-2.5-flash',
        currentTokens: 500,
        maxTokens: 1000000,
        systemPromptTokens: 500,
        toolsTokens: 0,
        mcpToolsTokens: 0,
        memoryTokens: 0,
        messagesTokens: 0,
        mcpTools: [],
        memoryFiles: [],
        slashCommands: 0,
      },
    };

    const { lastFrame } = render(<ContextDisplay item={item} />);

    const output = lastFrame();

    // Should show system prompt
    expect(output).toContain('System prompt:');

    // Should not show other sections
    expect(output).not.toContain('System tools:');
    expect(output).not.toContain('MCP tools:');
    expect(output).not.toContain('Memory files:');
    expect(output).not.toContain('Messages:');
    expect(output).not.toContain('SlashCommand Tool');
  });

  it('should format large numbers with k suffix', () => {
    const item: HistoryItemContext = {
      type: 'context',
      breakdown: {
        model: 'gemini-2.5-pro',
        currentTokens: 600000,
        maxTokens: 2000000,
        systemPromptTokens: 50000,
        toolsTokens: 100000,
        mcpToolsTokens: 200000,
        memoryTokens: 150000,
        messagesTokens: 100000,
        mcpTools: [],
        memoryFiles: [],
        slashCommands: 0,
      },
    };

    const { lastFrame } = render(<ContextDisplay item={item} />);

    const output = lastFrame();

    expect(output).toContain('600.0k/2000.0k tokens');
    expect(output).toContain('50.0k tokens');
    expect(output).toContain('100.0k tokens');
    expect(output).toContain('200.0k tokens');
    expect(output).toContain('150.0k tokens');
  });

  it('should display percentage for each component', () => {
    const item: HistoryItemContext = {
      type: 'context',
      breakdown: {
        model: 'gemini-2.5-pro',
        currentTokens: 10000,
        maxTokens: 100000,
        systemPromptTokens: 2000,
        toolsTokens: 3000,
        mcpToolsTokens: 2000,
        memoryTokens: 2000,
        messagesTokens: 1000,
        mcpTools: [],
        memoryFiles: [],
        slashCommands: 0,
      },
    };

    const { lastFrame } = render(<ContextDisplay item={item} />);

    const output = lastFrame();

    expect(output).toContain('(2.0%)'); // System prompt: 2000/100000 = 2%
    expect(output).toContain('(3.0%)'); // Tools: 3000/100000 = 3%
    expect(output).toContain('(1.0%)'); // Messages: 1000/100000 = 1%
  });

  it('should match snapshot for complete breakdown', () => {
    const item: HistoryItemContext = {
      type: 'context',
      breakdown: {
        model: 'gemini-2.5-pro',
        currentTokens: 60000,
        maxTokens: 200000,
        systemPromptTokens: 2900,
        toolsTokens: 13300,
        mcpToolsTokens: 16800,
        memoryTokens: 27000,
        messagesTokens: 8,
        mcpTools: [
          { name: 'mcp__ide__getDiagnostics', server: 'ide', tokens: 428 },
          {
            name: 'mcp__playwright__browserClose',
            server: 'playwright',
            tokens: 390,
          },
        ],
        memoryFiles: [{ path: '/project/memory.md', tokens: 2200 }],
        slashCommands: 681,
      },
    };

    const { lastFrame } = render(<ContextDisplay item={item} />);

    expect(lastFrame()).toMatchSnapshot();
  });
});
