/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  CLI_FLAGS,
  KEYBOARD_SHORTCUTS,
  SLASH_COMMANDS,
  formatFlagsReference,
  formatHotkeysReference,
  formatCommandsReference,
  getCliReference,
} from './cliSelfKnowledge.js';

describe('CliSelfKnowledge', () => {
  describe('CLI_FLAGS', () => {
    it('should contain the critical flags that users commonly ask about', () => {
      const names = CLI_FLAGS.map((f) => f.flag);
      expect(names).toContain('--model');
      expect(names).toContain('--prompt');
      expect(names).toContain('--sandbox');
      expect(names).toContain('--approval-mode');
      expect(names).toContain('--output-format');
      expect(names).toContain('--resume');
    });

    it('should mark --yolo as deprecated in favour of --approval-mode', () => {
      const yolo = CLI_FLAGS.find((f) => f.flag === '--yolo');
      expect(yolo).toBeDefined();
      expect(yolo!.deprecatedBy).toContain('--approval-mode');
    });

    it('should have correct aliases', () => {
      const byFlag = new Map(CLI_FLAGS.map((f) => [f.flag, f]));
      expect(byFlag.get('--model')!.alias).toBe('-m');
      expect(byFlag.get('--prompt')!.alias).toBe('-p');
      expect(byFlag.get('--sandbox')!.alias).toBe('-s');
    });

    it('should have unique flag names', () => {
      const names = CLI_FLAGS.map((f) => f.flag);
      expect(new Set(names).size).toBe(names.length);
    });

    it('every entry should have a non-empty description', () => {
      for (const f of CLI_FLAGS) {
        expect(f.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('KEYBOARD_SHORTCUTS', () => {
    it('should contain essential user-facing shortcuts', () => {
      const actions = KEYBOARD_SHORTCUTS.map((h) => h.action);
      expect(actions).toContain('Toggle YOLO mode');
      expect(actions).toContain('Cycle approval mode');
      expect(actions).toContain('Submit prompt');
      expect(actions).toContain('Insert newline');
    });

    it('should map Ctrl+Y to Toggle YOLO mode', () => {
      const yolo = KEYBOARD_SHORTCUTS.find((h) => h.action === 'Toggle YOLO mode');
      expect(yolo!.keys).toContain('Ctrl+Y');
    });

    it('every entry should have at least one key binding', () => {
      for (const h of KEYBOARD_SHORTCUTS) {
        expect(h.keys.length).toBeGreaterThan(0);
      }
    });
  });

  describe('SLASH_COMMANDS', () => {
    it('should contain core commands', () => {
      const names = SLASH_COMMANDS.map((c) => c.name);
      expect(names).toContain('help');
      expect(names).toContain('model');
      expect(names).toContain('mcp');
      expect(names).toContain('extensions');
      expect(names).toContain('quit');
      expect(names).toContain('shortcuts');
    });

    it('should mark agent-dependent commands', () => {
      expect(SLASH_COMMANDS.find((c) => c.name === 'agents')?.requiresAgents).toBe(true);
      expect(SLASH_COMMANDS.find((c) => c.name === 'skills')?.requiresAgents).toBe(true);
    });

    it('should have unique names', () => {
      const names = SLASH_COMMANDS.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('formatFlagsReference', () => {
    it('should produce markdown with header and deprecation warning', () => {
      const out = formatFlagsReference();
      expect(out).toContain('# Gemini CLI Flags Reference');
      expect(out).toContain('`--approval-mode`');
      expect(out).toContain('DEPRECATED');
      expect(out).toContain('(-m)');
    });
  });

  describe('formatHotkeysReference', () => {
    it('should produce grouped markdown', () => {
      const out = formatHotkeysReference();
      expect(out).toContain('# Gemini CLI Keyboard Shortcuts Reference');
      expect(out).toContain('## App');
      expect(out).toContain('`Ctrl+Y`');
    });
  });

  describe('formatCommandsReference', () => {
    it('should list commands with tags', () => {
      const out = formatCommandsReference();
      expect(out).toContain('# Gemini CLI Slash Commands Reference');
      expect(out).toContain('`/help`');
      expect(out).toContain('agents required');
    });
  });

  describe('getCliReference', () => {
    it('should return only the requested category', () => {
      expect(getCliReference('flags')).toContain('Flags Reference');
      expect(getCliReference('flags')).not.toContain('Keyboard Shortcuts');

      expect(getCliReference('hotkeys')).toContain('Keyboard Shortcuts');
      expect(getCliReference('hotkeys')).not.toContain('Flags Reference');

      expect(getCliReference('commands')).toContain('Slash Commands');
      expect(getCliReference('commands')).not.toContain('Flags Reference');
    });

    it('should return everything for "all"', () => {
      const out = getCliReference('all');
      expect(out).toContain('Flags Reference');
      expect(out).toContain('Keyboard Shortcuts');
      expect(out).toContain('Slash Commands');
    });
  });
});
