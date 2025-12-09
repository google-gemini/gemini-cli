/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  settingsDialogReducer,
  createInitialState,
  type SettingsDialogState,
  type SettingsDialogAction,
  type PendingValue,
} from './settingsDialogReducer.js';
import { SettingScope } from '../../config/settings.js';
import { getDialogSettingKeys } from '../../utils/settingsUtils.js';

describe('settingsDialogReducer', () => {
  let initialState: SettingsDialogState;

  beforeEach(() => {
    initialState = createInitialState();
  });

  describe('createInitialState', () => {
    it('should create valid initial state', () => {
      expect(initialState.focusSection).toBe('settings');
      expect(initialState.selectedScope).toBe(SettingScope.User);
      expect(initialState.activeSettingIndex).toBe(0);
      expect(initialState.scrollOffset).toBe(0);
      expect(initialState.searchQuery).toBe('');
      expect(initialState.filteredKeys).toEqual(getDialogSettingKeys());
      expect(initialState.globalPendingChanges).toEqual(new Map());
    });
  });

  describe('SET_FOCUS', () => {
    it('should set focus section to settings', () => {
      const action: SettingsDialogAction = {
        type: 'SET_FOCUS',
        section: 'settings',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.focusSection).toBe('settings');
    });

    it('should set focus section to scope', () => {
      const action: SettingsDialogAction = {
        type: 'SET_FOCUS',
        section: 'scope',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.focusSection).toBe('scope');
    });

    it('should not modify other state properties', () => {
      const action: SettingsDialogAction = {
        type: 'SET_FOCUS',
        section: 'scope',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.selectedScope).toBe(initialState.selectedScope);
      expect(result.activeSettingIndex).toBe(initialState.activeSettingIndex);
      expect(result.scrollOffset).toBe(initialState.scrollOffset);
    });
  });

  describe('TOGGLE_FOCUS', () => {
    it('should toggle from settings to scope', () => {
      const action: SettingsDialogAction = { type: 'TOGGLE_FOCUS' };
      const result = settingsDialogReducer(initialState, action);
      expect(result.focusSection).toBe('scope');
    });

    it('should toggle from scope to settings', () => {
      const stateWithScopeFocus = {
        ...initialState,
        focusSection: 'scope' as const,
      };
      const action: SettingsDialogAction = { type: 'TOGGLE_FOCUS' };
      const result = settingsDialogReducer(stateWithScopeFocus, action);
      expect(result.focusSection).toBe('settings');
    });
  });

  describe('SET_SCOPE', () => {
    it('should set selected scope', () => {
      const action: SettingsDialogAction = {
        type: 'SET_SCOPE',
        scope: SettingScope.System,
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.selectedScope).toBe(SettingScope.System);
    });

    it('should not modify other state properties', () => {
      const action: SettingsDialogAction = {
        type: 'SET_SCOPE',
        scope: SettingScope.Workspace,
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.focusSection).toBe(initialState.focusSection);
      expect(result.activeSettingIndex).toBe(initialState.activeSettingIndex);
    });
  });

  describe('NAVIGATE', () => {
    describe('up direction', () => {
      it('should move up when not at first item', () => {
        const state = {
          ...initialState,
          activeSettingIndex: 5,
          scrollOffset: 2,
        };
        const action: SettingsDialogAction = {
          type: 'NAVIGATE',
          direction: 'up',
          itemCount: 10,
          maxVisible: 5,
        };
        const result = settingsDialogReducer(state, action);
        expect(result.activeSettingIndex).toBe(4);
        expect(result.scrollOffset).toBe(2);
      });

      it('should wrap to last item when at first item', () => {
        const state = {
          ...initialState,
          activeSettingIndex: 0,
          scrollOffset: 0,
        };
        const action: SettingsDialogAction = {
          type: 'NAVIGATE',
          direction: 'up',
          itemCount: 10,
          maxVisible: 5,
        };
        const result = settingsDialogReducer(state, action);
        expect(result.activeSettingIndex).toBe(9);
        expect(result.scrollOffset).toBe(5);
      });

      it('should adjust scroll when moving up beyond visible area', () => {
        const state = {
          ...initialState,
          activeSettingIndex: 2,
          scrollOffset: 3,
        };
        const action: SettingsDialogAction = {
          type: 'NAVIGATE',
          direction: 'up',
          itemCount: 10,
          maxVisible: 5,
        };
        const result = settingsDialogReducer(state, action);
        expect(result.activeSettingIndex).toBe(1);
        expect(result.scrollOffset).toBe(1);
      });
    });

    describe('down direction', () => {
      it('should move down when not at last item', () => {
        const state = {
          ...initialState,
          activeSettingIndex: 3,
          scrollOffset: 0,
        };
        const action: SettingsDialogAction = {
          type: 'NAVIGATE',
          direction: 'down',
          itemCount: 10,
          maxVisible: 5,
        };
        const result = settingsDialogReducer(state, action);
        expect(result.activeSettingIndex).toBe(4);
        expect(result.scrollOffset).toBe(0);
      });

      it('should wrap to first item when at last item', () => {
        const state = {
          ...initialState,
          activeSettingIndex: 9,
          scrollOffset: 5,
        };
        const action: SettingsDialogAction = {
          type: 'NAVIGATE',
          direction: 'down',
          itemCount: 10,
          maxVisible: 5,
        };
        const result = settingsDialogReducer(state, action);
        expect(result.activeSettingIndex).toBe(0);
        expect(result.scrollOffset).toBe(0);
      });

      it('should adjust scroll when moving down beyond visible area', () => {
        const state = {
          ...initialState,
          activeSettingIndex: 6,
          scrollOffset: 2,
        };
        const action: SettingsDialogAction = {
          type: 'NAVIGATE',
          direction: 'down',
          itemCount: 10,
          maxVisible: 5,
        };
        const result = settingsDialogReducer(state, action);
        expect(result.activeSettingIndex).toBe(7);
        expect(result.scrollOffset).toBe(3);
      });
    });
  });

  describe('SET_SEARCH_QUERY', () => {
    it('should set search query', () => {
      const action: SettingsDialogAction = {
        type: 'SET_SEARCH_QUERY',
        query: 'vim mode',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.searchQuery).toBe('vim mode');
    });

    it('should handle empty query', () => {
      const action: SettingsDialogAction = {
        type: 'SET_SEARCH_QUERY',
        query: '',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.searchQuery).toBe('');
    });
  });

  describe('SET_FILTERED_KEYS', () => {
    it('should set filtered keys and reset navigation', () => {
      const keys = ['setting1', 'setting2', 'setting3'];
      const state = {
        ...initialState,
        activeSettingIndex: 5,
        scrollOffset: 3,
      };
      const action: SettingsDialogAction = {
        type: 'SET_FILTERED_KEYS',
        keys,
      };
      const result = settingsDialogReducer(state, action);
      expect(result.filteredKeys).toEqual(keys);
      expect(result.activeSettingIndex).toBe(0);
      expect(result.scrollOffset).toBe(0);
    });

    it('should handle empty keys array', () => {
      const action: SettingsDialogAction = {
        type: 'SET_FILTERED_KEYS',
        keys: [],
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.filteredKeys).toEqual([]);
      expect(result.activeSettingIndex).toBe(0);
      expect(result.scrollOffset).toBe(0);
    });
  });

  describe('ADD_PENDING_CHANGE', () => {
    it('should add new pending change', () => {
      const action: SettingsDialogAction = {
        type: 'ADD_PENDING_CHANGE',
        key: 'test.setting',
        value: true,
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.globalPendingChanges.size).toBe(1);
      expect(result.globalPendingChanges.get('test.setting')).toBe(true);
    });

    it('should update existing pending change', () => {
      const state = {
        ...initialState,
        globalPendingChanges: new Map<string, PendingValue>([
          ['test.setting', false],
        ]),
      };
      const action: SettingsDialogAction = {
        type: 'ADD_PENDING_CHANGE',
        key: 'test.setting',
        value: true,
      };
      const result = settingsDialogReducer(state, action);
      expect(result.globalPendingChanges.size).toBe(1);
      expect(result.globalPendingChanges.get('test.setting')).toBe(true);
    });

    it('should handle different value types', () => {
      let result = initialState;

      // Add boolean value
      const boolAction: SettingsDialogAction = {
        type: 'ADD_PENDING_CHANGE',
        key: 'bool.setting',
        value: true,
      };
      result = settingsDialogReducer(result, boolAction);

      // Add number value
      const numberAction: SettingsDialogAction = {
        type: 'ADD_PENDING_CHANGE',
        key: 'number.setting',
        value: 42,
      };
      result = settingsDialogReducer(result, numberAction);

      // Add string value
      const stringAction: SettingsDialogAction = {
        type: 'ADD_PENDING_CHANGE',
        key: 'string.setting',
        value: 'test',
      };
      result = settingsDialogReducer(result, stringAction);

      expect(result.globalPendingChanges.get('bool.setting')).toBe(true);
      expect(result.globalPendingChanges.get('number.setting')).toBe(42);
      expect(result.globalPendingChanges.get('string.setting')).toBe('test');
    });
  });

  describe('REMOVE_PENDING_CHANGE', () => {
    it('should remove existing pending change', () => {
      const state = {
        ...initialState,
        globalPendingChanges: new Map<string, PendingValue>([
          ['setting1', true],
          ['setting2', false],
        ]),
      };
      const action: SettingsDialogAction = {
        type: 'REMOVE_PENDING_CHANGE',
        key: 'setting1',
      };
      const result = settingsDialogReducer(state, action);
      expect(result.globalPendingChanges.size).toBe(1);
      expect(result.globalPendingChanges.has('setting1')).toBe(false);
      expect(result.globalPendingChanges.has('setting2')).toBe(true);
    });

    it('should handle non-existent key', () => {
      const state = {
        ...initialState,
        globalPendingChanges: new Map<string, PendingValue>([
          ['setting1', true],
        ]),
      };
      const action: SettingsDialogAction = {
        type: 'REMOVE_PENDING_CHANGE',
        key: 'non-existent',
      };
      const result = settingsDialogReducer(state, action);
      expect(result.globalPendingChanges.size).toBe(1);
      expect(result.globalPendingChanges.has('setting1')).toBe(true);
    });

    it('should handle empty pending changes', () => {
      const action: SettingsDialogAction = {
        type: 'REMOVE_PENDING_CHANGE',
        key: 'setting1',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.globalPendingChanges.size).toBe(0);
    });
  });

  describe('SAVE_AND_CLEAR_KEYS', () => {
    it('should remove specified keys from pending changes', () => {
      const state = {
        ...initialState,
        globalPendingChanges: new Map<string, PendingValue>([
          ['setting1', true],
          ['setting2', false],
          ['setting3', 'value'],
        ]),
      };
      const keysToSave = new Set(['setting1', 'setting3']);
      const action: SettingsDialogAction = {
        type: 'SAVE_AND_CLEAR_KEYS',
        keys: keysToSave,
      };
      const result = settingsDialogReducer(state, action);
      expect(result.globalPendingChanges.size).toBe(1);
      expect(result.globalPendingChanges.has('setting1')).toBe(false);
      expect(result.globalPendingChanges.has('setting2')).toBe(true);
      expect(result.globalPendingChanges.has('setting3')).toBe(false);
    });

    it('should handle empty pending changes', () => {
      const keysToSave = new Set(['setting1']);
      const action: SettingsDialogAction = {
        type: 'SAVE_AND_CLEAR_KEYS',
        keys: keysToSave,
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.globalPendingChanges.size).toBe(0);
    });

    it('should handle empty keys set', () => {
      const state = {
        ...initialState,
        globalPendingChanges: new Map<string, PendingValue>([
          ['setting1', true],
        ]),
      };
      const keysToSave = new Set<string>();
      const action: SettingsDialogAction = {
        type: 'SAVE_AND_CLEAR_KEYS',
        keys: keysToSave,
      };
      const result = settingsDialogReducer(state, action);
      expect(result.globalPendingChanges.size).toBe(1);
      expect(result.globalPendingChanges.has('setting1')).toBe(true);
    });
  });

  describe('CLEAR_ALL_PENDING', () => {
    it('should clear all pending changes', () => {
      const state = {
        ...initialState,
        globalPendingChanges: new Map<string, PendingValue>([
          ['setting1', true],
          ['setting2', false],
        ]),
      };
      const action: SettingsDialogAction = { type: 'CLEAR_ALL_PENDING' };
      const result = settingsDialogReducer(state, action);
      expect(result.globalPendingChanges.size).toBe(0);
    });

    it('should handle empty pending changes', () => {
      const action: SettingsDialogAction = { type: 'CLEAR_ALL_PENDING' };
      const result = settingsDialogReducer(initialState, action);
      expect(result.globalPendingChanges.size).toBe(0);
    });
  });

  describe('unknown action type', () => {
    it('should return current state for unknown action', () => {
      const unknownAction = {
        type: 'UNKNOWN_ACTION',
      } as unknown as SettingsDialogAction;
      const result = settingsDialogReducer(initialState, unknownAction);
      expect(result).toBe(initialState);
    });
  });

  describe('state immutability', () => {
    it('should not mutate the original state', () => {
      const action: SettingsDialogAction = {
        type: 'SET_FOCUS',
        section: 'scope',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result).not.toBe(initialState);
      expect(initialState.focusSection).toBe('settings');
    });

    it('should create new state objects for nested updates', () => {
      const state = {
        ...initialState,
        globalPendingChanges: new Map<string, PendingValue>([
          ['setting1', true],
        ]),
      };
      const action: SettingsDialogAction = {
        type: 'ADD_PENDING_CHANGE',
        key: 'setting2',
        value: false,
      };
      const result = settingsDialogReducer(state, action);
      expect(result.globalPendingChanges).not.toBe(state.globalPendingChanges);
      expect(state.globalPendingChanges.size).toBe(1);
      expect(result.globalPendingChanges.size).toBe(2);
    });
  });
});
