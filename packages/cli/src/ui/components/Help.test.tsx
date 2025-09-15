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

  it('renders help component with mock commands', () => {
    const { lastFrame } = render(<Help commands={mockCommands} />);
    const output = lastFrame();
    
    // Test platform-agnostic content
    expect(output).toContain('Basics:');
    expect(output).toContain('Add context: Use @ to specify files');
    expect(output).toContain('Shell mode: Execute shell commands via !');
    expect(output).toContain('Commands:');
    expect(output).toContain('/test - A test command');
    expect(output).toContain('/parent - A parent command');
    expect(output).toContain('visible-child - A visible child command');
    expect(output).toContain('Keyboard Shortcuts:');
    expect(output).toContain('Alt+Left/Right - Jump through words');
    expect(output).toContain('Ctrl+C - Quit application');
    expect(output).toContain('Ctrl+L - Clear the screen');
    expect(output).toContain('Ctrl+Y - Toggle YOLO mode');
    expect(output).toContain('Enter - Send message');
    expect(output).toContain('Esc - Cancel operation');
    expect(output).toContain('Up/Down - Cycle through your prompt history');
    expect(output).toContain('docs/keyboard-shortcuts.md');
  });

  describe('Platform-specific behavior', () => {
    it('renders correct shortcuts for linux', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      try {
        const { lastFrame } = render(<Help commands={mockCommands} />);
        expect(lastFrame()).toMatchSnapshot('linux-shortcuts');
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          writable: true,
          configurable: true,
        });
      }
    });

    it('renders correct shortcuts for darwin', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });

      try {
        const { lastFrame } = render(<Help commands={mockCommands} />);
        expect(lastFrame()).toMatchSnapshot('darwin-shortcuts');
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          writable: true,
          configurable: true,
        });
      }
    });

    it('renders correct shortcuts for win32', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      try {
        const { lastFrame } = render(<Help commands={mockCommands} />);
        expect(lastFrame()).toMatchSnapshot('win32-shortcuts');
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          writable: true,
          configurable: true,
        });
      }
    });
  });
});
