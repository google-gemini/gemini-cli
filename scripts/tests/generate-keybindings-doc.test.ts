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
});
