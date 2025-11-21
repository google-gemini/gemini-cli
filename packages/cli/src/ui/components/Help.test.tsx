/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { Help } from './Help.js';
import type { SlashCommand } from '../commands/types.js';
import { CommandKind } from '../commands/types.js';

const mockCommands: readonly SlashCommand[] = [
  {
    name: 'test',
    description: 'A test command',
    kind: CommandKind.BUILT_IN,
  },
  {
    name: 'hidden',
    description: 'A hidden command',
    hidden: true,
    kind: CommandKind.BUILT_IN,
  },
  {
    name: 'parent',
    description: 'A parent command',
    kind: CommandKind.BUILT_IN,
    subCommands: [
      {
        name: 'visible-child',
        description: 'A visible child command',
        kind: CommandKind.BUILT_IN,
      },
      {
        name: 'hidden-child',
        description: 'A hidden child command',
        hidden: true,
        kind: CommandKind.BUILT_IN,
      },
    ],
  },
];

describe('Help Component', () => {
  it('should not render hidden commands', () => {
    const { lastFrame, unmount } = render(<Help commands={mockCommands} />);
    const output = lastFrame();

    expect(output).toContain('/test');
    expect(output).not.toContain('/hidden');
    unmount();
  });

  it('should not render hidden subcommands', () => {
    const { lastFrame, unmount } = render(<Help commands={mockCommands} />);
    const output = lastFrame();

    expect(output).toContain('visible-child');
    expect(output).not.toContain('hidden-child');
    unmount();
  });

  it('should render keyboard shortcuts', () => {
    const { lastFrame, unmount } = render(<Help commands={mockCommands} />);
    const output = lastFrame();

    expect(output).toContain('Keyboard Shortcuts:');
    expect(output).toContain('Ctrl+C');
    expect(output).toContain('Ctrl+S');
    expect(output).toContain('Page Up/Down');
    unmount();
  });
});
