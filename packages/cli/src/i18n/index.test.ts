/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { t } from './index.js';

describe('Phase 1: i18n Foundation', () => {
  describe('Basic functionality', () => {
    it('should provide t function from i18next', () => {
      // Test that t function works with actual translations
      expect(t('sections.basics', { ns: 'help' })).toBe('Basics:');
      expect(t('buttons.ok', { ns: 'common' })).toBe('OK');
    });

    it('should fallback to key when translation missing', () => {
      expect(t('nonexistent.key')).toBe('nonexistent.key');
    });

    it('should use default namespace when not specified', () => {
      expect(t('buttons.ok')).toBe('OK'); // Should use 'common' as default
    });
  });

  describe('Help component translations', () => {
    it('should have all section headers', () => {
      expect(t('sections.basics', { ns: 'help' })).toBe('Basics:');
      expect(t('sections.commands', { ns: 'help' })).toBe('Commands:');
      expect(t('sections.shortcuts', { ns: 'help' })).toBe(
        'Keyboard Shortcuts:',
      );
    });

    it('should have basic functionality descriptions', () => {
      expect(t('basics.addContext', { ns: 'help' })).toContain('Add context');
      expect(t('basics.shellMode', { ns: 'help' })).toContain('Shell mode');
      expect(t('shortcutsDocs', { ns: 'help' })).toContain(
        'For a full list of shortcuts',
      );
    });

    it('should have all keyboard shortcuts', () => {
      expect(t('shortcuts.altLeftRight', { ns: 'help' })).toBe(
        'Jump through words in the input',
      );
      expect(t('shortcuts.ctrlC', { ns: 'help' })).toBe('Quit application');
      expect(t('shortcuts.enter', { ns: 'help' })).toBe('Send message');
    });
  });

  describe('Dialog translations', () => {
    it('should have auth dialog strings', () => {
      expect(t('auth.title', { ns: 'dialogs' })).toBe('Get started');
      expect(t('auth.description', { ns: 'dialogs' })).toBe(
        'How would you like to authenticate for this project?',
      );
    });

    it('should have auth options', () => {
      expect(t('auth.options.google', { ns: 'dialogs' })).toBe(
        'Login with Google',
      );
      expect(t('auth.options.geminiKey', { ns: 'dialogs' })).toBe(
        'Use Gemini API Key',
      );
    });

    it('should have settings dialog strings', () => {
      expect(t('settings.title', { ns: 'dialogs' })).toBe('Settings');
      expect(t('settings.applyTo', { ns: 'dialogs' })).toBe('Apply To');
    });
  });

  describe('Translation completeness', () => {
    it('should not return empty strings for core UI elements', () => {
      const coreKeys = [
        { key: 'sections.basics', ns: 'help' },
        { key: 'auth.title', ns: 'dialogs' },
        { key: 'settings.title', ns: 'dialogs' },
        { key: 'buttons.ok', ns: 'common' },
      ];

      coreKeys.forEach(({ key, ns }) => {
        const result = t(key, { ns });
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);
        expect(result).not.toBe(key); // Should not fallback to key
      });
    });
  });

  describe('Namespace handling', () => {
    it('should handle different namespaces correctly', () => {
      // Test with existing keys in different namespaces
      const helpTitle = t('sections.basics', { ns: 'help' });
      const dialogTitle = t('auth.title', { ns: 'dialogs' });
      expect(helpTitle).toBe('Basics:');
      expect(dialogTitle).toBe('Get started');
      expect(helpTitle).not.toBe(dialogTitle);
    });

    it('should fallback to key when namespace does not exist', () => {
      expect(t('some.key', { ns: 'nonexistent' })).toBe('some.key');
    });

    it('should fallback to key when key does not exist in valid namespace', () => {
      expect(t('nonexistent.key', { ns: 'help' })).toBe('nonexistent.key');
    });
  });
});
