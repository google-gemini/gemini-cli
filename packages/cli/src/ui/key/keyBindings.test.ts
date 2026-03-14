/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Storage } from '@google/gemini-cli-core';
import {
  Command,
  commandCategories,
  commandDescriptions,
  defaultKeyBindingConfig,
  KeyBinding,
  loadCustomKeybindings,
} from './keyBindings.js';

describe('KeyBinding', () => {
  describe('constructor', () => {
    it('should parse a simple key', () => {
      const binding = new KeyBinding('a');
      expect(binding.name).toBe('a');
      expect(binding.ctrl).toBe(false);
      expect(binding.shift).toBe(false);
      expect(binding.alt).toBe(false);
      expect(binding.cmd).toBe(false);
    });

    it('should parse ctrl+key', () => {
      const binding = new KeyBinding('ctrl+c');
      expect(binding.name).toBe('c');
      expect(binding.ctrl).toBe(true);
    });

    it('should parse shift+key', () => {
      const binding = new KeyBinding('shift+z');
      expect(binding.name).toBe('z');
      expect(binding.shift).toBe(true);
    });

    it('should parse alt+key', () => {
      const binding = new KeyBinding('alt+left');
      expect(binding.name).toBe('left');
      expect(binding.alt).toBe(true);
    });

    it('should parse cmd+key', () => {
      const binding = new KeyBinding('cmd+f');
      expect(binding.name).toBe('f');
      expect(binding.cmd).toBe(true);
    });

    it('should handle aliases (option/opt/meta)', () => {
      const optionBinding = new KeyBinding('option+b');
      expect(optionBinding.name).toBe('b');
      expect(optionBinding.alt).toBe(true);

      const optBinding = new KeyBinding('opt+b');
      expect(optBinding.name).toBe('b');
      expect(optBinding.alt).toBe(true);

      const metaBinding = new KeyBinding('meta+enter');
      expect(metaBinding.name).toBe('enter');
      expect(metaBinding.cmd).toBe(true);
    });

    it('should parse multiple modifiers', () => {
      const binding = new KeyBinding('ctrl+shift+alt+cmd+x');
      expect(binding.name).toBe('x');
      expect(binding.ctrl).toBe(true);
      expect(binding.shift).toBe(true);
      expect(binding.alt).toBe(true);
      expect(binding.cmd).toBe(true);
    });

    it('should be case-insensitive', () => {
      const binding = new KeyBinding('CTRL+Shift+F');
      expect(binding.name).toBe('f');
      expect(binding.ctrl).toBe(true);
      expect(binding.shift).toBe(true);
    });

    it('should handle named keys with modifiers', () => {
      const binding = new KeyBinding('ctrl+enter');
      expect(binding.name).toBe('enter');
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
  });
});

describe('keyBindings config', () => {
  it('should have bindings for all commands', () => {
    for (const command of Object.values(Command)) {
      expect(defaultKeyBindingConfig.has(command)).toBe(true);
      expect(defaultKeyBindingConfig.get(command)?.length).toBeGreaterThan(0);
    }
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

describe('loadCustomKeybindings', () => {
  let tempDir: string;
  let tempFilePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gemini-keybindings-test-'),
    );
    tempFilePath = path.join(tempDir, 'keybindings.json');
    vi.spyOn(Storage, 'getUserKeybindingsPath').mockReturnValue(tempFilePath);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns default bindings when file does not exist', async () => {
    // We don't write the file.
    const { config, errors } = await loadCustomKeybindings();

    expect(errors).toHaveLength(0);
    expect(config.get(Command.RETURN)).toEqual([new KeyBinding('enter')]);
  });

  it('merges valid custom bindings, prepending them to defaults', async () => {
    const customJson = JSON.stringify([
      { command: Command.RETURN, key: 'ctrl+a' },
    ]);
    await fs.writeFile(tempFilePath, customJson, 'utf8');

    const { config, errors } = await loadCustomKeybindings();

    expect(errors).toHaveLength(0);
    expect(config.get(Command.RETURN)).toEqual([
      new KeyBinding('ctrl+a'),
      new KeyBinding('enter'),
    ]);
  });

  it('handles JSON with comments', async () => {
    const customJson = `
      [
        // This is a comment
        { "command": "${Command.QUIT}", "key": "ctrl+x" }
      ]
    `;
    await fs.writeFile(tempFilePath, customJson, 'utf8');

    const { config, errors } = await loadCustomKeybindings();

    expect(errors).toHaveLength(0);
    expect(config.get(Command.QUIT)).toEqual([
      new KeyBinding('ctrl+x'),
      new KeyBinding('ctrl+c'),
    ]);
  });

  it('returns validation errors for invalid schema', async () => {
    const invalidJson = JSON.stringify([{ command: 'unknown', key: 'a' }]);
    await fs.writeFile(tempFilePath, invalidJson, 'utf8');

    const { config, errors } = await loadCustomKeybindings();

    expect(errors.length).toBeGreaterThan(0);

    expect(errors[0]).toMatch(/error at 0.command: Invalid command: "unknown"/);
    // Should still have defaults
    expect(config.get(Command.RETURN)).toEqual([new KeyBinding('enter')]);
  });

  it('returns validation errors for invalid key patterns but loads valid ones', async () => {
    const mixedJson = JSON.stringify([
      { command: Command.RETURN, key: 'super+a' }, // invalid
      { command: Command.QUIT, key: 'ctrl+y' }, // valid
    ]);
    await fs.writeFile(tempFilePath, mixedJson, 'utf8');

    const { config, errors } = await loadCustomKeybindings();

    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/Invalid keybinding/);
    expect(config.get(Command.QUIT)).toEqual([
      new KeyBinding('ctrl+y'),
      new KeyBinding('ctrl+c'),
    ]);
  });

  it('removes specific bindings when using the minus prefix', async () => {
    const customJson = JSON.stringify([
      { command: `-${Command.RETURN}`, key: 'enter' },
      { command: Command.RETURN, key: 'ctrl+a' },
    ]);
    await fs.writeFile(tempFilePath, customJson, 'utf8');

    const { config, errors } = await loadCustomKeybindings();

    expect(errors).toHaveLength(0);
    // 'enter' should be gone, only 'ctrl+a' should remain
    expect(config.get(Command.RETURN)).toEqual([new KeyBinding('ctrl+a')]);
  });

  it('returns an error when attempting to negate a non-existent binding', async () => {
    const customJson = JSON.stringify([
      { command: `-${Command.RETURN}`, key: 'ctrl+z' },
    ]);
    await fs.writeFile(tempFilePath, customJson, 'utf8');

    const { config, errors } = await loadCustomKeybindings();

    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(
      /Invalid keybinding for command "-basic.confirm": Error: cannot remove "ctrl\+z" since it is not bound/,
    );
    // Defaults should still be present
    expect(config.get(Command.RETURN)).toEqual([new KeyBinding('enter')]);
  });
});
