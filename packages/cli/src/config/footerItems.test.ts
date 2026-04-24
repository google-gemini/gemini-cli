/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  deriveItemsFromLegacySettings,
  resolveFooterState,
} from './footerItems.js';
import { createMockSettings } from '../test-utils/settings.js';

describe('footerItems', () => {
  describe('deriveItemsFromLegacySettings', () => {
    it('returns defaults when no legacy settings are customized', () => {
      const settings = createMockSettings({
        ui: { footer: { showContextPercentage: false } },
      }).merged;
      const items = deriveItemsFromLegacySettings(settings);
      expect(items).toEqual([
        'workspace',
        'git-branch',
        'sandbox',
        'model-name',
        'quota',
      ]);
    });

    it('removes workspace when showCWD is false', () => {
      const settings = createMockSettings({
        ui: { footer: { showCWD: false, showContextPercentage: false } },
      }).merged;
      const items = deriveItemsFromLegacySettings(settings);
      expect(items).not.toContain('workspace');
    });

    it('removes sandbox when showSandboxStatus is false', () => {
      const settings = createMockSettings({
        ui: {
          footer: { showSandboxStatus: false, showContextPercentage: false },
        },
      }).merged;
      const items = deriveItemsFromLegacySettings(settings);
      expect(items).not.toContain('sandbox');
    });

    it('removes model-name, context-used, and quota when showModelInfo is false', () => {
      const settings = createMockSettings({
        ui: { footer: { showModelInfo: false, showContextPercentage: false } },
      }).merged;
      const items = deriveItemsFromLegacySettings(settings);
      expect(items).not.toContain('model-name');
      expect(items).not.toContain('context-used');
      expect(items).not.toContain('quota');
    });

    it('includes context-used when showContextPercentage is true', () => {
      const settings = createMockSettings({
        ui: { footer: { showContextPercentage: true } },
      }).merged;
      const items = deriveItemsFromLegacySettings(settings);
      expect(items).toContain('context-used');
      // Should be after model-name
      const modelIdx = items.indexOf('model-name');
      const contextIdx = items.indexOf('context-used');
      expect(contextIdx).toBe(modelIdx + 1);
    });

    it('includes memory-usage when showMemoryUsage is true', () => {
      const settings = createMockSettings({
        ui: { showMemoryUsage: true, footer: { showContextPercentage: false } },
      }).merged;
      const items = deriveItemsFromLegacySettings(settings);
      expect(items).toContain('memory-usage');
    });

    it('handles combination of settings', () => {
      const settings = createMockSettings({
        ui: {
          showMemoryUsage: true,
          footer: {
            showCWD: false,
            showModelInfo: false,
            showContextPercentage: true,
          },
        },
      }).merged;
      const items = deriveItemsFromLegacySettings(settings);
      expect(items).toEqual([
        'git-branch',
        'sandbox',
        'context-used',
        'memory-usage',
      ]);
    });
  });

  describe('resolveFooterState', () => {
    it('filters out auth item when showUserIdentity is false', () => {
      const settings = createMockSettings({
        ui: {
          showUserIdentity: false,
          footer: {
            items: ['workspace', 'auth', 'model-name'],
          },
        },
      }).merged;

      const state = resolveFooterState(settings);
      expect(state.orderedIds).not.toContain('auth');
      expect(state.selectedIds.has('auth')).toBe(false);
      // It should also not be in the 'others' part of orderedIds
      expect(state.orderedIds).toEqual([
        'workspace',
        'model-name',
        'git-branch',
        'sandbox',
        'context-used',
        'quota',
        'memory-usage',
        'session-id',
        'code-changes',
        'token-count',
      ]);
    });

    it('includes auth item when showUserIdentity is true', () => {
      const settings = createMockSettings({
        ui: {
          showUserIdentity: true,
          footer: {
            items: ['workspace', 'auth', 'model-name'],
          },
        },
      }).merged;

      const state = resolveFooterState(settings);
      expect(state.orderedIds).toContain('auth');
      expect(state.selectedIds.has('auth')).toBe(true);
    });

    it('includes auth item by default when showUserIdentity is undefined (defaults to true)', () => {
      const settings = createMockSettings({
        ui: {
          footer: {
            items: ['workspace', 'auth', 'model-name'],
          },
        },
      }).merged;

      const state = resolveFooterState(settings);
      expect(state.orderedIds).toContain('auth');
      expect(state.selectedIds.has('auth')).toBe(true);
    });

    it('includes context-used in selectedIds when showContextPercentage is true and items is undefined', () => {
      const settings = createMockSettings({
        ui: {
          footer: {
            showContextPercentage: true,
          },
        },
      }).merged;

      const state = resolveFooterState(settings);
      expect(state.selectedIds.has('context-used')).toBe(true);
      expect(state.orderedIds).toContain('context-used');
    });

    it('does not include context-used in selectedIds when showContextPercentage is false (default)', () => {
      const settings = createMockSettings({
        ui: {
          footer: {
            showContextPercentage: false,
          },
        },
      }).merged;

      const state = resolveFooterState(settings);
      expect(state.selectedIds.has('context-used')).toBe(false);
      // context-used should still be in orderedIds (as unselected)
      expect(state.orderedIds).toContain('context-used');
    });

    it('persisted items array takes precedence over showContextPercentage', () => {
      const settings = createMockSettings({
        ui: {
          footer: {
            items: ['workspace', 'model-name'],
            showContextPercentage: true,
          },
        },
      }).merged;

      const state = resolveFooterState(settings);
      // items array explicitly omits context-used, so it should not be selected
      expect(state.selectedIds.has('context-used')).toBe(false);
    });
  });
});
