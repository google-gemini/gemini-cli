/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createNonInteractiveUI } from './nonInteractiveUi.js';

describe('createNonInteractiveUI', () => {
  it('should return an object with all required properties', () => {
    const ui = createNonInteractiveUI();

    expect(ui.addItem).toBeDefined();
    expect(ui.clear).toBeDefined();
    expect(ui.setDebugMessage).toBeDefined();
    expect(ui.loadHistory).toBeDefined();
    expect(ui.pendingItem).toBeDefined();
    expect(ui.setPendingItem).toBeDefined();
    expect(ui.toggleCorgiMode).toBeDefined();
    expect(ui.toggleVimEnabled).toBeDefined();
    expect(ui.setGeminiMdFileCount).toBeDefined();
    expect(ui.reloadCommands).toBeDefined();
    expect(ui.extensionsUpdateState).toBeDefined();
    expect(ui.setExtensionsUpdateState).toBeDefined();
  });

  describe('addItem', () => {
    it('should be a function', () => {
      const ui = createNonInteractiveUI();
      expect(typeof ui.addItem).toBe('function');
    });

    it('should return 0', () => {
      const ui = createNonInteractiveUI();
      const result = ui.addItem({} as never, 0);
      expect(result).toBe(0);
    });

    it('should accept any item and timestamp', () => {
      const ui = createNonInteractiveUI();
      expect(() => ui.addItem({ test: 'item' } as never, 12345)).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should be a function', () => {
      const ui = createNonInteractiveUI();
      expect(typeof ui.clear).toBe('function');
    });

    it('should be a no-op function', () => {
      const ui = createNonInteractiveUI();
      expect(() => ui.clear()).not.toThrow();
    });

    it('should return undefined', () => {
      const ui = createNonInteractiveUI();
      const result = ui.clear();
      expect(result).toBeUndefined();
    });
  });

  describe('setDebugMessage', () => {
    it('should be a function', () => {
      const ui = createNonInteractiveUI();
      expect(typeof ui.setDebugMessage).toBe('function');
    });

    it('should accept string message', () => {
      const ui = createNonInteractiveUI();
      expect(() => ui.setDebugMessage('debug message')).not.toThrow();
    });

    it('should be a no-op function', () => {
      const ui = createNonInteractiveUI();
      const result = ui.setDebugMessage('test');
      expect(result).toBeUndefined();
    });
  });

  describe('loadHistory', () => {
    it('should be a function', () => {
      const ui = createNonInteractiveUI();
      expect(typeof ui.loadHistory).toBe('function');
    });

    it('should accept history array', () => {
      const ui = createNonInteractiveUI();
      expect(() => ui.loadHistory([] as never)).not.toThrow();
    });

    it('should be a no-op function', () => {
      const ui = createNonInteractiveUI();
      const result = ui.loadHistory([{ test: 'history' }] as never);
      expect(result).toBeUndefined();
    });
  });

  describe('pendingItem', () => {
    it('should be null', () => {
      const ui = createNonInteractiveUI();
      expect(ui.pendingItem).toBeNull();
    });
  });

  describe('setPendingItem', () => {
    it('should be a function', () => {
      const ui = createNonInteractiveUI();
      expect(typeof ui.setPendingItem).toBe('function');
    });

    it('should accept any item', () => {
      const ui = createNonInteractiveUI();
      expect(() => ui.setPendingItem({ test: 'item' } as never)).not.toThrow();
    });

    it('should be a no-op function', () => {
      const ui = createNonInteractiveUI();
      const result = ui.setPendingItem(null);
      expect(result).toBeUndefined();
    });
  });

  describe('toggleCorgiMode', () => {
    it('should be a function', () => {
      const ui = createNonInteractiveUI();
      expect(typeof ui.toggleCorgiMode).toBe('function');
    });

    it('should be a no-op function', () => {
      const ui = createNonInteractiveUI();
      expect(() => ui.toggleCorgiMode()).not.toThrow();
    });

    it('should return undefined', () => {
      const ui = createNonInteractiveUI();
      const result = ui.toggleCorgiMode();
      expect(result).toBeUndefined();
    });
  });

  describe('toggleVimEnabled', () => {
    it('should be an async function', () => {
      const ui = createNonInteractiveUI();
      expect(typeof ui.toggleVimEnabled).toBe('function');
    });

    it('should return false', async () => {
      const ui = createNonInteractiveUI();
      const result = await ui.toggleVimEnabled();
      expect(result).toBe(false);
    });

    it('should return a Promise', () => {
      const ui = createNonInteractiveUI();
      const result = ui.toggleVimEnabled();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('setGeminiMdFileCount', () => {
    it('should be a function', () => {
      const ui = createNonInteractiveUI();
      expect(typeof ui.setGeminiMdFileCount).toBe('function');
    });

    it('should accept number count', () => {
      const ui = createNonInteractiveUI();
      expect(() => ui.setGeminiMdFileCount(42)).not.toThrow();
    });

    it('should be a no-op function', () => {
      const ui = createNonInteractiveUI();
      const result = ui.setGeminiMdFileCount(100);
      expect(result).toBeUndefined();
    });
  });

  describe('reloadCommands', () => {
    it('should be a function', () => {
      const ui = createNonInteractiveUI();
      expect(typeof ui.reloadCommands).toBe('function');
    });

    it('should be a no-op function', () => {
      const ui = createNonInteractiveUI();
      expect(() => ui.reloadCommands()).not.toThrow();
    });

    it('should return undefined', () => {
      const ui = createNonInteractiveUI();
      const result = ui.reloadCommands();
      expect(result).toBeUndefined();
    });
  });

  describe('extensionsUpdateState', () => {
    it('should be a Map', () => {
      const ui = createNonInteractiveUI();
      expect(ui.extensionsUpdateState).toBeInstanceOf(Map);
    });

    it('should be an empty Map', () => {
      const ui = createNonInteractiveUI();
      expect(ui.extensionsUpdateState.size).toBe(0);
    });
  });

  describe('setExtensionsUpdateState', () => {
    it('should be a function', () => {
      const ui = createNonInteractiveUI();
      expect(typeof ui.setExtensionsUpdateState).toBe('function');
    });

    it('should accept update state', () => {
      const ui = createNonInteractiveUI();
      expect(() => ui.setExtensionsUpdateState(new Map())).not.toThrow();
    });

    it('should be a no-op function', () => {
      const ui = createNonInteractiveUI();
      const result = ui.setExtensionsUpdateState(
        new Map([['key', 'value']]) as never,
      );
      expect(result).toBeUndefined();
    });
  });

  describe('multiple instances', () => {
    it('should create independent instances', () => {
      const ui1 = createNonInteractiveUI();
      const ui2 = createNonInteractiveUI();

      expect(ui1).not.toBe(ui2);
      expect(ui1.extensionsUpdateState).not.toBe(ui2.extensionsUpdateState);
    });
  });
});
