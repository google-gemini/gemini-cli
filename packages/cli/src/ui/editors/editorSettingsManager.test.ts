/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  editorSettingsManager,
  EDITOR_DISPLAY_NAMES,
  type EditorDisplay,
} from './editorSettingsManager.js';
import type { EditorType } from '@google/gemini-cli-core';
import * as coreModule from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    checkHasEditorType: vi.fn(),
    allowEditorTypeInSandbox: vi.fn(),
  };
});

describe('editorSettingsManager', () => {
  beforeEach(() => {
    vi.mocked(coreModule.checkHasEditorType).mockReturnValue(true);
    vi.mocked(coreModule.allowEditorTypeInSandbox).mockReturnValue(true);
  });

  describe('EDITOR_DISPLAY_NAMES constant', () => {
    it('should define display names for all editor types', () => {
      expect(EDITOR_DISPLAY_NAMES).toBeDefined();
      expect(typeof EDITOR_DISPLAY_NAMES).toBe('object');
    });

    it('should have cursor editor', () => {
      expect(EDITOR_DISPLAY_NAMES.cursor).toBe('Cursor');
    });

    it('should have emacs editor', () => {
      expect(EDITOR_DISPLAY_NAMES.emacs).toBe('Emacs');
    });

    it('should have neovim editor', () => {
      expect(EDITOR_DISPLAY_NAMES.neovim).toBe('Neovim');
    });

    it('should have vim editor', () => {
      expect(EDITOR_DISPLAY_NAMES.vim).toBe('Vim');
    });

    it('should have vscode editor', () => {
      expect(EDITOR_DISPLAY_NAMES.vscode).toBe('VS Code');
    });

    it('should have vscodium editor', () => {
      expect(EDITOR_DISPLAY_NAMES.vscodium).toBe('VSCodium');
    });

    it('should have windsurf editor', () => {
      expect(EDITOR_DISPLAY_NAMES.windsurf).toBe('Windsurf');
    });

    it('should have zed editor', () => {
      expect(EDITOR_DISPLAY_NAMES.zed).toBe('Zed');
    });

    it('should have exactly 8 editor types', () => {
      const keys = Object.keys(EDITOR_DISPLAY_NAMES);
      expect(keys).toHaveLength(8);
    });

    it('should use proper capitalization', () => {
      const values = Object.values(EDITOR_DISPLAY_NAMES);
      for (const value of values) {
        expect(value[0]).toBe(value[0]?.toUpperCase());
      }
    });

    it('should have unique display names', () => {
      const values = Object.values(EDITOR_DISPLAY_NAMES);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  describe('EditorDisplay type', () => {
    it('should define valid EditorDisplay with editor type', () => {
      const display: EditorDisplay = {
        name: 'VS Code',
        type: 'vscode',
        disabled: false,
      };

      expect(display).toBeDefined();
      expect(display.name).toBe('VS Code');
      expect(display.type).toBe('vscode');
      expect(display.disabled).toBe(false);
    });

    it('should allow not_set type', () => {
      const display: EditorDisplay = {
        name: 'None',
        type: 'not_set',
        disabled: false,
      };

      expect(display.type).toBe('not_set');
    });

    it('should allow disabled flag', () => {
      const display: EditorDisplay = {
        name: 'Vim (Not installed)',
        type: 'vim',
        disabled: true,
      };

      expect(display.disabled).toBe(true);
    });
  });

  describe('editorSettingsManager singleton', () => {
    it('should be defined', () => {
      expect(editorSettingsManager).toBeDefined();
    });

    it('should have getAvailableEditorDisplays method', () => {
      expect(editorSettingsManager.getAvailableEditorDisplays).toBeDefined();
      expect(typeof editorSettingsManager.getAvailableEditorDisplays).toBe(
        'function',
      );
    });

    it('should be a singleton', () => {
      const ref1 = editorSettingsManager;
      const ref2 = editorSettingsManager;

      expect(ref1).toBe(ref2);
    });
  });

  describe('getAvailableEditorDisplays', () => {
    it('should return array of editor displays', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();

      expect(Array.isArray(displays)).toBe(true);
      expect(displays.length).toBeGreaterThan(0);
    });

    it('should include None option', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();
      const noneOption = displays.find((d) => d.type === 'not_set');

      expect(noneOption).toBeDefined();
      expect(noneOption?.name).toBe('None');
      expect(noneOption?.disabled).toBe(false);
    });

    it('should have None as first option', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();

      expect(displays[0]?.type).toBe('not_set');
      expect(displays[0]?.name).toBe('None');
    });

    it('should include all editor types', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();
      const editorTypes = Object.keys(EDITOR_DISPLAY_NAMES) as EditorType[];

      for (const type of editorTypes) {
        const found = displays.find((d) => d.type === type);
        expect(found).toBeDefined();
      }
    });

    it('should return same array reference on multiple calls', () => {
      const displays1 = editorSettingsManager.getAvailableEditorDisplays();
      const displays2 = editorSettingsManager.getAvailableEditorDisplays();

      expect(displays1).toBe(displays2);
    });

    it('should have 9 total options (None + 8 editors)', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();

      expect(displays).toHaveLength(9);
    });

    it('should sort editors alphabetically', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();
      const editorDisplays = displays.slice(1); // Skip 'None'
      const types = editorDisplays.map((d) => d.type);

      const sortedTypes = [...types].sort();
      expect(types).toEqual(sortedTypes);
    });
  });

  describe('editor availability detection', () => {
    it('should call checkHasEditorType for each editor', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();
      const editorTypes = Object.keys(EDITOR_DISPLAY_NAMES) as EditorType[];

      expect(displays.length).toBeGreaterThan(0);
      // checkHasEditorType called during initialization for all types
      for (const type of editorTypes) {
        expect(coreModule.checkHasEditorType).toHaveBeenCalledWith(type);
      }
    });

    it('should mark editors as enabled when all checks pass', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();
      const vimDisplay = displays.find((d) => d.type === 'vim');

      // With mocks set to true in beforeEach
      expect(vimDisplay?.disabled).toBe(false);
      expect(vimDisplay?.name).not.toContain('Not installed');
      expect(vimDisplay?.name).not.toContain('Not available');
    });

    it('should have base names when editors available', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();

      for (const display of displays) {
        if (display.type !== 'not_set') {
          const baseName = EDITOR_DISPLAY_NAMES[display.type as EditorType];
          expect(display.name).toContain(baseName);
        }
      }
    });
  });

  describe('sandbox restrictions', () => {
    it('should call allowEditorTypeInSandbox for each editor', () => {
      editorSettingsManager.getAvailableEditorDisplays();

      const editorTypes = Object.keys(EDITOR_DISPLAY_NAMES) as EditorType[];
      for (const type of editorTypes) {
        expect(coreModule.allowEditorTypeInSandbox).toHaveBeenCalledWith(type);
      }
    });

    it('should check sandbox allowance during initialization', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();

      expect(displays.length).toBeGreaterThan(0);
      expect(coreModule.allowEditorTypeInSandbox).toHaveBeenCalled();
    });
  });

  describe('label formatting', () => {
    it('should include editor base names', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();
      const vscodeDisplay = displays.find((d) => d.type === 'vscode');

      expect(vscodeDisplay?.name).toContain('VS Code');
    });

    it('should have proper display names for all editors', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();

      const editorTypes = Object.keys(EDITOR_DISPLAY_NAMES) as EditorType[];
      for (const type of editorTypes) {
        const display = displays.find((d) => d.type === type);
        expect(display).toBeDefined();
        expect(display?.name).toContain(EDITOR_DISPLAY_NAMES[type]);
      }
    });

    it('should format names with potential suffixes', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();

      for (const display of displays) {
        if (display.type !== 'not_set') {
          expect(display.name).toBeDefined();
          expect(display.name.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('disabled state', () => {
    it('should have disabled property for all editors', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();

      for (const display of displays) {
        expect(display).toHaveProperty('disabled');
        expect(typeof display.disabled).toBe('boolean');
      }
    });

    it('should mark editors based on availability checks', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();
      const cursorDisplay = displays.find((d) => d.type === 'cursor');

      // With mocks set to true in beforeEach, editors should be enabled
      expect(cursorDisplay?.disabled).toBe(false);
    });

    it('should never disable None option', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();
      const noneOption = displays.find((d) => d.type === 'not_set');

      expect(noneOption?.disabled).toBe(false);
    });

    it('should have consistent disabled state', () => {
      const displays1 = editorSettingsManager.getAvailableEditorDisplays();
      const displays2 = editorSettingsManager.getAvailableEditorDisplays();

      for (let i = 0; i < displays1.length; i++) {
        expect(displays1[i]?.disabled).toBe(displays2[i]?.disabled);
      }
    });
  });

  describe('type consistency', () => {
    it('should match EditorType from core module', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();
      const editorDisplays = displays.filter((d) => d.type !== 'not_set');

      for (const display of editorDisplays) {
        expect(Object.keys(EDITOR_DISPLAY_NAMES)).toContain(display.type);
      }
    });

    it('should use display names from constant', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();

      for (const display of displays) {
        if (display.type !== 'not_set') {
          const expectedName = EDITOR_DISPLAY_NAMES[display.type as EditorType];
          expect(display.name).toContain(expectedName);
        }
      }
    });
  });

  describe('initialization', () => {
    it('should initialize available editors on construction', () => {
      const displays = editorSettingsManager.getAvailableEditorDisplays();

      expect(displays.length).toBeGreaterThan(0);
    });

    it('should cache available editors', () => {
      const displays1 = editorSettingsManager.getAvailableEditorDisplays();
      const displays2 = editorSettingsManager.getAvailableEditorDisplays();

      // Should return same reference
      expect(displays1).toBe(displays2);
    });

    it('should check editor types during initialization', () => {
      editorSettingsManager.getAvailableEditorDisplays();

      expect(coreModule.checkHasEditorType).toHaveBeenCalled();
      expect(coreModule.allowEditorTypeInSandbox).toHaveBeenCalled();
    });
  });
});
