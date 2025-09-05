/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Help } from './Help.js';
import type { SlashCommand } from '../commands/types.js';
import { CommandKind } from '../commands/types.js';

const builtInCommands: readonly SlashCommand[] = [
  {
    name: 'help',
    description: 'Show this help message.',
    kind: CommandKind.BUILT_IN,
  },
  {
    name: 'exit',
    description: 'Exit the application.',
    kind: CommandKind.BUILT_IN,
  },
];

describe('<Help/>', () => {
  it('renders without custom commands section when none are provided', () => {
    const { lastFrame } = render(<Help commands={builtInCommands} />);
    const output = lastFrame();

    expect(output).toContain('/help');
    expect(output).toContain('Show this help message.');
    expect(output).toContain('/exit');
    expect(output).toContain('Exit the application.');
    expect(output).not.toContain('Custom Commands:');
  });

  it('renders with custom commands section when custom commands are provided', () => {
    const customCommands: readonly SlashCommand[] = [
      {
        name: 'custom1',
        description: 'This is a custom command from an extension.',
        kind: CommandKind.FILE, // or any other non-BUILT_IN kind
        extensionName: 'extension-foo',
      },
      {
        name: 'custom2',
        description: 'This is a custom command from an MCP server.',
        kind: CommandKind.MCP_PROMPT,
        mcpServerName: 'mcp-server-bar',
      },
    ];

    const allCommands = [...builtInCommands, ...customCommands];
    const { lastFrame } = render(<Help commands={allCommands} />);
    const output = lastFrame();

    expect(output).toContain('/help');
    expect(output).toContain('Show this help message.');
    expect(output).toContain('/exit');
    expect(output).toContain('Exit the application.');
    expect(output).toContain('Commands from extension extension-foo:');
    expect(output).toContain('/custom1');
    expect(output).toContain('This is a custom command from an extension.');
    expect(output).toContain('Commands from MCP server mcp-server-bar:');
    expect(output).toContain('/custom2');
    expect(output).toContain('This is a custom command from an MCP server.');
  });
});
