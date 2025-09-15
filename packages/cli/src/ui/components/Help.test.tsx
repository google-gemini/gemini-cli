/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { render } from 'ink-testing-library';
import { describe, it, expect, beforeAll } from 'vitest';
import { Help } from './Help.js';
import type { SlashCommand } from '../commands/types.js';
import { CommandKind } from '../commands/types.js';
import '../../i18n/index.js';

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
  beforeAll(async () => {
    // Ensure i18next is ready and has loaded resources
    const i18next = (await import('../../i18n/index.js')).default;
    // Wait for i18next to be fully initialized
    if (!i18next.isInitialized) {
      await i18next.init();
    }
  });

  it('should not render hidden commands', () => {
    const { lastFrame } = render(<Help commands={mockCommands} />);
    const output = lastFrame();

    expect(output).toContain('/test');
    expect(output).not.toContain('/hidden');
  });

  it('should not render hidden subcommands', () => {
    const { lastFrame } = render(<Help commands={mockCommands} />);
    const output = lastFrame();

    expect(output).toContain('visible-child');
    expect(output).not.toContain('hidden-child');
  });

  it('renders basic help content', () => {
    const { lastFrame } = render(<Help commands={mockCommands} />);
    const output = lastFrame();

    // Test i18n content
    expect(output).toContain('Basics:');
    expect(output).toContain('Commands:');
    expect(output).toContain('Keyboard Shortcuts:');
    expect(output).toContain('Add context: Use @ to specify files');
    expect(output).toContain('Shell mode: Execute shell commands via !');
    expect(output).toContain('shell command');
    expect(output).toContain('Model Context Protocol command');
  });

  it('renders platform-specific shortcuts correctly', () => {
    const { lastFrame } = render(<Help commands={mockCommands} />);
    const output = lastFrame();

    // Test platform-agnostic shortcuts
    expect(output).toContain('Ctrl+C - Quit application');
    expect(output).toContain('Ctrl+L - Clear the screen');
    expect(output).toContain('Ctrl+Y - Toggle YOLO mode');
    expect(output).toContain('Alt+Left/Right - Jump through words');

    // Test platform-specific shortcuts
    if (process.platform === 'win32') {
      expect(output).toContain('Ctrl+Enter - New line');
      expect(output).toContain('Ctrl+X - Open input in external editor');
    } else if (process.platform === 'darwin') {
      expect(output).toContain('Ctrl+J - New line');
      expect(output).toContain(
        'Ctrl+X / Meta+Enter - Open input in external editor',
      );
    } else {
      // Linux and other platforms
      expect(output).toContain(
        'Ctrl+J - New line (Alt+Enter works for certain linux distros)',
      );
      expect(output).toContain('Ctrl+X - Open input in external editor');
    }
  });
});
