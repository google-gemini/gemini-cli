/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  main as generateKeybindingDocs,
  renderDocumentation,
  type KeybindingDocSection,
} from '../generate-keybindings-doc.ts';

describe('generate-keybindings-doc', () => {
  it('keeps keyboard shortcut documentation in sync in check mode', async () => {
    const previousExitCode = process.exitCode;
    try {
      process.exitCode = 0;
      await expect(
        generateKeybindingDocs(['--check']),
      ).resolves.toBeUndefined();
      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('renders provided sections into markdown tables', () => {
    const sections: KeybindingDocSection[] = [
      {
        title: 'Custom Controls',
        commands: [
          {
            description: 'Trigger custom action.',
            bindings: [{ key: 'x', ctrl: true }],
          },
          {
            description: 'Submit with Enter if no modifiers are held.',
            bindings: [{ key: 'return', ctrl: false, shift: false }],
          },
        ],
      },
      {
        title: 'Navigation',
        commands: [
          {
            description: 'Move up through results.',
            bindings: [
              { key: 'up', shift: false },
              { key: 'p', ctrl: true, shift: false },
            ],
          },
        ],
      },
    ];

    const markdown = renderDocumentation(sections);
    expect(markdown).toContain('#### Custom Controls');
    expect(markdown).toContain('Trigger custom action.');
    expect(markdown).toContain('`Ctrl + X`');
    expect(markdown).toContain('Submit with Enter if no modifiers are held.');
    expect(markdown).toContain('`Enter (no Ctrl, no Shift)`');
    expect(markdown).toContain('#### Navigation');
    expect(markdown).toContain('Move up through results.');
    expect(markdown).toContain('`Up Arrow (no Shift)`');
    expect(markdown).toContain('`Ctrl + P (no Shift)`');
  });

  it('handles empty bindings array', () => {
    const sections: KeybindingDocSection[] = [
      {
        title: 'Empty Section',
        commands: [
          {
            description: 'Command with no bindings.',
            bindings: [],
          },
        ],
      },
    ];

    const markdown = renderDocumentation(sections);
    expect(markdown).toContain('#### Empty Section');
    expect(markdown).toContain('Command with no bindings.');
    expect(markdown).toContain('| Command with no bindings. |  |');
  });

  it('deduplicates identical bindings', () => {
    const sections: KeybindingDocSection[] = [
      {
        title: 'Deduplication Test',
        commands: [
          {
            description: 'Command with duplicate bindings.',
            bindings: [
              { key: 'x', ctrl: true },
              { key: 'x', ctrl: true },
              { key: 'x', ctrl: true },
            ],
          },
        ],
      },
    ];

    const markdown = renderDocumentation(sections);
    const ctrlXCount = (markdown.match(/`Ctrl \+ X`/g) || []).length;
    expect(ctrlXCount).toBe(1);
  });

  it('handles multiple modifiers correctly', () => {
    const sections: KeybindingDocSection[] = [
      {
        title: 'Multi-Modifier Test',
        commands: [
          {
            description: 'Command with multiple modifiers.',
            bindings: [
              { key: 's', ctrl: true, shift: true },
              { key: 'z', ctrl: true, command: true },
            ],
          },
        ],
      },
    ];

    const markdown = renderDocumentation(sections);
    expect(markdown).toContain('`Ctrl + Shift + S`');
    expect(markdown).toContain('`Ctrl + Cmd + Z`');
  });

  it('handles function keys correctly', () => {
    const sections: KeybindingDocSection[] = [
      {
        title: 'Function Keys Test',
        commands: [
          {
            description: 'Command with function keys.',
            bindings: [
              { key: 'f1', ctrl: true },
              { key: 'f12', shift: true },
            ],
          },
        ],
      },
    ];

    const markdown = renderDocumentation(sections);
    expect(markdown).toContain('`Ctrl + F1`');
    expect(markdown).toContain('`Shift + F12`');
  });

  it('handles single character keys correctly', () => {
    const sections: KeybindingDocSection[] = [
      {
        title: 'Single Character Test',
        commands: [
          {
            description: 'Command with single character keys.',
            bindings: [
              { key: 'a', ctrl: true },
              { key: 'z', shift: true },
            ],
          },
        ],
      },
    ];

    const markdown = renderDocumentation(sections);
    expect(markdown).toContain('`Ctrl + A`');
    expect(markdown).toContain('`Shift + Z`');
  });

  it('handles empty sections gracefully', () => {
    const sections: KeybindingDocSection[] = [
      {
        title: 'Empty Section',
        commands: [],
      },
    ];

    const markdown = renderDocumentation(sections);
    expect(markdown).toContain('#### Empty Section');
    expect(markdown).toContain('| Action | Keys |');
  });

  it('handles multiple sections correctly', () => {
    const sections: KeybindingDocSection[] = [
      {
        title: 'First Section',
        commands: [
          {
            description: 'First command.',
            bindings: [{ key: 'a', ctrl: true }],
          },
        ],
      },
      {
        title: 'Second Section',
        commands: [
          {
            description: 'Second command.',
            bindings: [{ key: 'b', shift: true }],
          },
        ],
      },
    ];

    const markdown = renderDocumentation(sections);
    expect(markdown).toContain('#### First Section');
    expect(markdown).toContain('#### Second Section');
    expect(markdown).toContain('`Ctrl + A`');
    expect(markdown).toContain('`Shift + B`');
  });
});
