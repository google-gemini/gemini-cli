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
import { KeyBinding } from '../../packages/cli/src/ui/key/keyBindings.js';

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
            command: 'custom.trigger',
            description: 'Trigger custom action.',
            bindings: [new KeyBinding('ctrl+x')],
          },
          {
            command: 'custom.submit',
            description: 'Submit with Enter if no modifiers are held.',
            bindings: [new KeyBinding('enter')],
          },
        ],
      },
      {
        title: 'Navigation',
        commands: [
          {
            command: 'nav.up',
            description: 'Move up through results.',
            bindings: [new KeyBinding('up'), new KeyBinding('ctrl+p')],
          },
        ],
      },
    ];

    const markdown = renderDocumentation(sections);
    expect(markdown).toContain('#### Custom Controls');
    expect(markdown).toContain('`custom.trigger`');
    expect(markdown).toContain('Trigger custom action.');
    expect(markdown).toContain('`Ctrl+X`');
    expect(markdown).toContain('`custom.submit`');
    expect(markdown).toContain('Submit with Enter if no modifiers are held.');
    expect(markdown).toContain('`Enter`');
    expect(markdown).toContain('#### Navigation');
    expect(markdown).toContain('`nav.up`');
    expect(markdown).toContain('Move up through results.');
    expect(markdown).toContain('`Up`<br />`Ctrl+P`');
  });
});
