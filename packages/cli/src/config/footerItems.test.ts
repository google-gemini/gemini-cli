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
        ui: { footer: { hideContextPercentage: true } },
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

    it('removes workspace when hideCWD is true', () => {
      const settings = createMockSettings({
        ui: { footer: { hideCWD: true, hideContextPercentage: true } },
      }).merged;
      const items = deriveItemsFromLegacySettings(settings);
      expect(items).not.toContain('workspace');
    });

    it('removes sandbox when hideSandboxStatus is true', () => {
      const settings = createMockSettings({
        ui: {
          footer: { hideSandboxStatus: true, hideContextPercentage: true },
        },
      }).merged;
      const items = deriveItemsFromLegacySettings(settings);
      expect(items).not.toContain('sandbox');
    });

    it('removes model-name, context-used, and quota when hideModelInfo is true', () => {
      const settings = createMockSettings({
        ui: { footer: { hideModelInfo: true, hideContextPercentage: true } },
      }).merged;
      const items = deriveItemsFromLegacySettings(settings);
      expect(items).not.toContain('model-name');
      expect(items).not.toContain('context-used');
      expect(items).not.toContain('quota');
    });

    it('includes context-used when hideContextPercentage is false', () => {
      const settings = createMockSettings({
        ui: { footer: { hideContextPercentage: false } },
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
        ui: { showMemoryUsage: true, footer: { hideContextPercentage: true } },
      }).merged;
      const items = deriveItemsFromLegacySettings(settings);
      expect(items).toContain('memory-usage');
    });

    it('handles combination of settings', () => {
      const settings = createMockSettings({
        ui: {
          showMemoryUsage: true,
          footer: {
            hideCWD: true,
            hideModelInfo: true,
            hideContextPercentage: false,
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
  });
});
