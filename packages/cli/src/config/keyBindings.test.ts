/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { KeyBindingConfig } from './keyBindings.js';
import { Command, defaultKeyBindings } from './keyBindings.js';

describe('keyBindings config', () => {
  describe('defaultKeyBindings', () => {
    it('should have bindings for all commands', () => {
      const commands = Object.values(Command);

      for (const command of commands) {
        expect(defaultKeyBindings[command]).toBeDefined();
        expect(Array.isArray(defaultKeyBindings[command])).toBe(true);
      }
    });

    it('should have valid key binding structures', () => {
      for (const [_, bindings] of Object.entries(defaultKeyBindings)) {
        for (const binding of bindings) {
          // Each binding should have either key or sequence, but not both
          const hasKey = binding.key !== undefined;
          const hasSequence = binding.sequence !== undefined;

          expect(hasKey || hasSequence).toBe(true);
          expect(hasKey && hasSequence).toBe(false);

          // Modifier properties should be boolean or undefined
          if (binding.ctrl !== undefined) {
            expect(typeof binding.ctrl).toBe('boolean');
          }
          if (binding.shift !== undefined) {
            expect(typeof binding.shift).toBe('boolean');
          }
          if (binding.command !== undefined) {
            expect(typeof binding.command).toBe('boolean');
          }
          if (binding.paste !== undefined) {
            expect(typeof binding.paste).toBe('boolean');
          }
        }
      }
    });

    it('should export all required types', () => {
      // Basic type checks
      expect(typeof Command.HOME).toBe('string');
      expect(typeof Command.END).toBe('string');

      // Config should be readonly
      const config: KeyBindingConfig = defaultKeyBindings;
      expect(config[Command.HOME]).toBeDefined();
    });

    it('should have correct specific bindings', () => {
      // Verify navigation ignores shift
      const navUp = defaultKeyBindings[Command.NAVIGATION_UP];
      expect(navUp).toContainEqual({ key: 'up', shift: false });

      const navDown = defaultKeyBindings[Command.NAVIGATION_DOWN];
      expect(navDown).toContainEqual({ key: 'down', shift: false });

      // Verify dialog navigation
      const dialogNavUp = defaultKeyBindings[Command.DIALOG_NAVIGATION_UP];
      expect(dialogNavUp).toContainEqual({ key: 'up', shift: false });
      expect(dialogNavUp).toContainEqual({ key: 'k', shift: false });

      const dialogNavDown = defaultKeyBindings[Command.DIALOG_NAVIGATION_DOWN];
      expect(dialogNavDown).toContainEqual({ key: 'down', shift: false });
      expect(dialogNavDown).toContainEqual({ key: 'j', shift: false });

      // Verify physical home/end keys
      expect(defaultKeyBindings[Command.HOME]).toContainEqual({ key: 'home' });
      expect(defaultKeyBindings[Command.END]).toContainEqual({ key: 'end' });
    });
  });
});
