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

  // Test for current runtime platform
  it('renders help component with current platform shortcuts', () => {
    const { lastFrame } = render(<Help commands={mockCommands} />);
    
    // Use platform-specific snapshot that matches current runtime platform
    const platformSuffix = process.platform === 'win32' ? 'win32' : 
                          process.platform === 'darwin' ? 'darwin' : 'linux';
    expect(lastFrame()).toMatchSnapshot(`current-platform-${platformSuffix}`);
  });

  // Ensure all platform snapshots exist by generating them explicitly
  it('generates snapshots for all platforms', () => {
    const platforms = [
      { name: 'linux', value: 'linux' },
      { name: 'darwin', value: 'darwin' },
      { name: 'win32', value: 'win32' }
    ];

    platforms.forEach(({ name, value }) => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: value,
        writable: true,
        configurable: true,
      });

      try {
        const { lastFrame } = render(<Help commands={mockCommands} />);
        expect(lastFrame()).toMatchSnapshot(`current-platform-${name}`);
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          writable: true,
          configurable: true,
        });
      }
    });
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
