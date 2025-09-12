/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { render } from 'ink-testing-library';
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
  it('renders help component with mock commands', () => {
    const { lastFrame } = render(<Help commands={mockCommands} />);
    expect(lastFrame()).toMatchSnapshot();
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
