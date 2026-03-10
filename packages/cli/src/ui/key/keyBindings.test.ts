/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { KeyBindingConfig } from './keyBindings.js';
import {
  Command,
  commandCategories,
  commandDescriptions,
  defaultKeyBindings,
  KeyBinding,
} from './keyBindings.js';

describe('KeyBinding', () => {
  describe('constructor', () => {
    it('should parse a simple key', () => {
      const binding = new KeyBinding('a');
      expect(binding.key).toBe('a');
      expect(binding.ctrl).toBe(false);
      expect(binding.shift).toBe(false);
      expect(binding.alt).toBe(false);
      expect(binding.cmd).toBe(false);
    });

    it('should parse ctrl+key', () => {
      const binding = new KeyBinding('ctrl+c');
      expect(binding.key).toBe('c');
      expect(binding.ctrl).toBe(true);
    });

    it('should parse shift+key', () => {
      const binding = new KeyBinding('shift+z');
      expect(binding.key).toBe('z');
      expect(binding.shift).toBe(true);
    });

    it('should parse alt+key', () => {
      const binding = new KeyBinding('alt+left');
      expect(binding.key).toBe('left');
      expect(binding.alt).toBe(true);
    });

    it('should parse cmd+key', () => {
      const binding = new KeyBinding('cmd+f');
      expect(binding.key).toBe('f');
      expect(binding.cmd).toBe(true);
    });

    it('should handle aliases (option/opt/meta)', () => {
      const optionBinding = new KeyBinding('option+b');
      expect(optionBinding.key).toBe('b');
      expect(optionBinding.alt).toBe(true);

      const optBinding = new KeyBinding('opt+b');
      expect(optBinding.key).toBe('b');
      expect(optBinding.alt).toBe(true);

      const metaBinding = new KeyBinding('meta+enter');
      expect(metaBinding.key).toBe('enter');
      expect(metaBinding.cmd).toBe(true);
    });

    it('should parse multiple modifiers', () => {
      const binding = new KeyBinding('ctrl+shift+alt+cmd+x');
      expect(binding.key).toBe('x');
      expect(binding.ctrl).toBe(true);
      expect(binding.shift).toBe(true);
      expect(binding.alt).toBe(true);
      expect(binding.cmd).toBe(true);
    });

    it('should be case-insensitive', () => {
      const binding = new KeyBinding('CTRL+Shift+F');
      expect(binding.key).toBe('f');
      expect(binding.ctrl).toBe(true);
      expect(binding.shift).toBe(true);
    });

    it('should handle named keys with modifiers', () => {
      const binding = new KeyBinding('ctrl+return');
      expect(binding.key).toBe('return');
      expect(binding.ctrl).toBe(true);
    });

    it('should throw an error for invalid keys or typos in modifiers', () => {
      expect(() => new KeyBinding('ctrl+unknown')).toThrow(
        'Invalid keybinding key: "unknown" in "ctrl+unknown"',
      );
      expect(() => new KeyBinding('ctlr+a')).toThrow(
        'Invalid keybinding key: "ctlr+a" in "ctlr+a"',
      );
    });

    it('should throw an error for literal "+" as key (must use "=")', () => {
      // VS Code style peeling logic results in "+" as the remains
      expect(() => new KeyBinding('alt++')).toThrow(
        'Invalid keybinding key: "+" in "alt++"',
      );
    });
  });
});

describe('keyBindings config', () => {
  describe('defaultKeyBindings', () => {
    it('should have bindings for all commands', () => {
      const commands = Object.values(Command);

      for (const command of commands) {
        expect(defaultKeyBindings[command]).toBeDefined();
        expect(Array.isArray(defaultKeyBindings[command])).toBe(true);
        expect(defaultKeyBindings[command]?.length).toBeGreaterThan(0);
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
  });

  describe('command metadata', () => {
    const commandValues = Object.values(Command);

    it('has a description entry for every command', () => {
      const describedCommands = Object.keys(commandDescriptions);
      expect(describedCommands.sort()).toEqual([...commandValues].sort());

      for (const command of commandValues) {
        expect(typeof commandDescriptions[command]).toBe('string');
        expect(commandDescriptions[command]?.trim()).not.toHaveLength(0);
      }
    });

    it('categorizes each command exactly once', () => {
      const seen = new Set<Command>();

      for (const category of commandCategories) {
        expect(typeof category.title).toBe('string');
        expect(Array.isArray(category.commands)).toBe(true);

        for (const command of category.commands) {
          expect(commandValues).toContain(command);
          expect(seen.has(command)).toBe(false);
          seen.add(command);
        }
      }

      expect(seen.size).toBe(commandValues.length);
    });
  });
});
