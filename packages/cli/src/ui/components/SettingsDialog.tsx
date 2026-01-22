/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Text } from 'ink';
import { AsyncFzf } from 'fzf';
import { theme } from '../semantic-colors.js';
import type {
  LoadableSettingScope,
  LoadedSettings,
  Settings,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { getScopeMessageForSetting } from '../../utils/dialogScopeUtils.js';
import {
  getDialogSettingKeys,
  setPendingSettingValue,
  getDisplayValue,
  hasRestartRequiredSettings,
  saveModifiedSettings,
  getSettingDefinition,
  isDefaultValue,
  requiresRestart,
  getRestartRequiredFromModified,
  getEffectiveDefaultValue,
  setPendingSettingValueAny,
  getNestedValue,
  getEffectiveValue,
} from '../../utils/settingsUtils.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import chalk from 'chalk';
import { cpSlice, cpLen, stripUnsafeCharacters } from '../utils/textUtils.js';
import {
  type SettingsValue,
  TOGGLE_TYPES,
} from '../../config/settingsSchema.js';
import { coreEvents, debugLogger } from '@google/gemini-cli-core';
import { keyMatchers, Command } from '../keyMatchers.js';
import type { Config } from '@google/gemini-cli-core';
import {
  BaseSettingsDialog,
  type BaseSettingsItem,
} from './shared/BaseSettingsDialog.js';
import { type Key } from '../hooks/useKeypress.js';

interface FzfResult {
  item: string;
  start: number;
  end: number;
  score: number;
  positions?: number[];
}

interface SettingsDialogProps {
  settings: LoadedSettings;
  onSelect: (settingName: string | undefined, scope: SettingScope) => void;
  onRestartRequest?: () => void;
  availableTerminalHeight?: number;
  config?: Config;
}

interface SettingItem extends BaseSettingsItem {
  type: string | undefined;
  value: string;
}

export function SettingsDialog({
  settings,
  onSelect,
  onRestartRequest,
  availableTerminalHeight,
  config,
}: SettingsDialogProps): React.JSX.Element {
  // Get vim mode context to sync vim mode changes
  const { vimEnabled, toggleVimEnabled } = useVimMode();

  // Scope selector state (User by default)
  const [selectedScope, setSelectedScope] = useState<LoadableSettingScope>(
    SettingScope.User,
  );
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredKeys, setFilteredKeys] = useState<string[]>(() =>
    getDialogSettingKeys(),
  );
  const { fzfInstance, searchMap } = useMemo(() => {
    const keys = getDialogSettingKeys();
    const map = new Map<string, string>();
    const searchItems: string[] = [];

    keys.forEach((key) => {
      const def = getSettingDefinition(key);
      if (def?.label) {
        searchItems.push(def.label);
        map.set(def.label.toLowerCase(), key);
      }
    });

    const fzf = new AsyncFzf(searchItems, {
      fuzzy: 'v2',
      casing: 'case-insensitive',
    });
    return { fzfInstance: fzf, searchMap: map };
  }, []);

  // Perform search
  useEffect(() => {
    let active = true;
    if (!searchQuery.trim() || !fzfInstance) {
      setFilteredKeys(getDialogSettingKeys());
      return;
    }

    const doSearch = async () => {
      const results = await fzfInstance.find(searchQuery);

      if (!active) return;

      const matchedKeys = new Set<string>();
      results.forEach((res: FzfResult) => {
        const key = searchMap.get(res.item.toLowerCase());
        if (key) matchedKeys.add(key);
      });
      setFilteredKeys(Array.from(matchedKeys));
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    doSearch();

    return () => {
      active = false;
    };
  }, [searchQuery, fzfInstance, searchMap]);

  // Local pending settings state for the selected scope
  const [pendingSettings, setPendingSettings] = useState<Settings>(() =>
    // Deep clone to avoid mutation
    structuredClone(settings.forScope(selectedScope).settings),
  );

  // Track which settings have been modified by the user
  const [modifiedSettings, setModifiedSettings] = useState<Set<string>>(
    new Set(),
  );

  // Preserve pending changes across scope switches
  type PendingValue = boolean | number | string;
  const [globalPendingChanges, setGlobalPendingChanges] = useState<
    Map<string, PendingValue>
  >(new Map());

  // Track restart-required settings across scope changes
  const [_restartRequiredSettings, setRestartRequiredSettings] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    // Base settings for selected scope
    let updated = structuredClone(settings.forScope(selectedScope).settings);
    // Overlay globally pending (unsaved) changes so user sees their modifications in any scope
    const newModified = new Set<string>();
    const newRestartRequired = new Set<string>();
    for (const [key, value] of globalPendingChanges.entries()) {
      const def = getSettingDefinition(key);
      if (def?.type === 'boolean' && typeof value === 'boolean') {
        updated = setPendingSettingValue(key, value, updated);
      } else if (
        (def?.type === 'number' && typeof value === 'number') ||
        (def?.type === 'string' && typeof value === 'string')
      ) {
        updated = setPendingSettingValueAny(key, value, updated);
      }
      newModified.add(key);
      if (requiresRestart(key)) newRestartRequired.add(key);
    }
    setPendingSettings(updated);
    setModifiedSettings(newModified);
    setRestartRequiredSettings(newRestartRequired);
    setShowRestartPrompt(newRestartRequired.size > 0);
  }, [selectedScope, settings, globalPendingChanges]);

  const toggleItem = (key: string) => {
    const definition = getSettingDefinition(key);
    if (!TOGGLE_TYPES.has(definition?.type)) {
      return;
    }
    const currentValue = getEffectiveValue(key, pendingSettings, {});
    let newValue: SettingsValue;
    if (definition?.type === 'boolean') {
      newValue = !(currentValue as boolean);
      setPendingSettings((prev) =>
        setPendingSettingValue(key, newValue as boolean, prev),
      );
    } else if (definition?.type === 'enum' && definition.options) {
      const options = definition.options;
      const currentIndex = options?.findIndex(
        (opt) => opt.value === currentValue,
      );
      if (currentIndex !== -1 && currentIndex < options.length - 1) {
        newValue = options[currentIndex + 1].value;
      } else {
        newValue = options[0].value; // loop back to start.
      }
      setPendingSettings((prev) =>
        setPendingSettingValueAny(key, newValue, prev),
      );
    }

    if (!requiresRestart(key)) {
      const immediateSettings = new Set([key]);
      const currentScopeSettings = settings.forScope(selectedScope).settings;
      const immediateSettingsObject = setPendingSettingValueAny(
        key,
        newValue,
        currentScopeSettings,
      );
      debugLogger.log(
        `[DEBUG SettingsDialog] Saving ${key} immediately with value:`,
        newValue,
      );
      saveModifiedSettings(
        immediateSettings,
        immediateSettingsObject,
        settings,
        selectedScope,
      );

      // Special handling for vim mode to sync with VimModeContext
      if (key === 'general.vimMode' && newValue !== vimEnabled) {
        // Call toggleVimEnabled to sync the VimModeContext local state
        toggleVimEnabled().catch((error) => {
          coreEvents.emitFeedback('error', 'Failed to toggle vim mode:', error);
        });
      }

      // Remove from modifiedSettings since it's now saved
      setModifiedSettings((prev) => {
        const updated = new Set(prev);
        updated.delete(key);
        return updated;
      });

      // Also remove from restart-required settings if it was there
      setRestartRequiredSettings((prev) => {
        const updated = new Set(prev);
        updated.delete(key);
        return updated;
      });

      // Remove from global pending changes if present
      setGlobalPendingChanges((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });

      if (key === 'general.previewFeatures') {
        config?.setPreviewFeatures(newValue as boolean);
      }
    } else {
      // For restart-required settings, track as modified
      setModifiedSettings((prev) => {
        const updated = new Set(prev).add(key);
        const needsRestart = hasRestartRequiredSettings(updated);
        debugLogger.log(
          `[DEBUG SettingsDialog] Modified settings:`,
          Array.from(updated),
          'Needs restart:',
          needsRestart,
        );
        if (needsRestart) {
          setShowRestartPrompt(true);
          setRestartRequiredSettings((prevRestart) =>
            new Set(prevRestart).add(key),
          );
        }
        return updated;
      });

      // Add/update pending change globally so it persists across scopes
      setGlobalPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(key, newValue as PendingValue);
        return next;
      });
    }
  };

  const generateSettingsItems = (): SettingItem[] => {
    const settingKeys = searchQuery ? filteredKeys : getDialogSettingKeys();

    return settingKeys.map((key: string) => {
      const definition = getSettingDefinition(key);

      return {
        key,
        label: definition?.label || key,
        description: definition?.description,
        value: key,
        type: definition?.type,
        scopeMessage: getScopeMessageForSetting(key, selectedScope, settings),
      };
    });
  };

  const items = generateSettingsItems();

  // Generic edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<string>('');
  const [editCursorPos, setEditCursorPos] = useState<number>(0); // Cursor position within edit buffer
  const [cursorVisible, setCursorVisible] = useState<boolean>(true);

  useEffect(() => {
    if (!editingKey) {
      setCursorVisible(true);
      return;
    }
    const id = setInterval(() => setCursorVisible((v) => !v), 500);
    return () => clearInterval(id);
  }, [editingKey]);

  const startEditing = (key: string, initial?: string) => {
    setEditingKey(key);
    const initialValue = initial ?? '';
    setEditBuffer(initialValue);
    setEditCursorPos(cpLen(initialValue)); // Position cursor at end of initial value
  };

  const commitEdit = (key: string) => {
    const definition = getSettingDefinition(key);
    const type = definition?.type;

    if (editBuffer.trim() === '' && type === 'number') {
      // Nothing entered for a number; cancel edit
      setEditingKey(null);
      setEditBuffer('');
      setEditCursorPos(0);
      return;
    }

    let parsed: string | number;
    if (type === 'number') {
      const numParsed = Number(editBuffer.trim());
      if (Number.isNaN(numParsed)) {
        // Invalid number; cancel edit
        setEditingKey(null);
        setEditBuffer('');
        setEditCursorPos(0);
        return;
      }
      parsed = numParsed;
    } else {
      // For strings, use the buffer as is.
      parsed = editBuffer;
    }

    // Update pending
    setPendingSettings((prev) => setPendingSettingValueAny(key, parsed, prev));

    if (!requiresRestart(key)) {
      const immediateSettings = new Set([key]);
      const currentScopeSettings = settings.forScope(selectedScope).settings;
      const immediateSettingsObject = setPendingSettingValueAny(
        key,
        parsed,
        currentScopeSettings,
      );
      saveModifiedSettings(
        immediateSettings,
        immediateSettingsObject,
        settings,
        selectedScope,
      );

      // Remove from modified sets if present
      setModifiedSettings((prev) => {
        const updated = new Set(prev);
        updated.delete(key);
        return updated;
      });
      setRestartRequiredSettings((prev) => {
        const updated = new Set(prev);
        updated.delete(key);
        return updated;
      });

      // Remove from global pending since it's immediately saved
      setGlobalPendingChanges((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } else {
      // Mark as modified and needing restart
      setModifiedSettings((prev) => {
        const updated = new Set(prev).add(key);
        const needsRestart = hasRestartRequiredSettings(updated);
        if (needsRestart) {
          setShowRestartPrompt(true);
          setRestartRequiredSettings((prevRestart) =>
            new Set(prevRestart).add(key),
          );
        }
        return updated;
      });

      // Record pending change globally for persistence across scopes
      setGlobalPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(key, parsed as PendingValue);
        return next;
      });
    }

    setEditingKey(null);
    setEditBuffer('');
    setEditCursorPos(0);
  };

  const saveRestartRequiredSettings = () => {
    const restartRequiredSettings =
      getRestartRequiredFromModified(modifiedSettings);
    const restartRequiredSet = new Set(restartRequiredSettings);

    if (restartRequiredSet.size > 0) {
      saveModifiedSettings(
        restartRequiredSet,
        pendingSettings,
        settings,
        selectedScope,
      );

      // Remove saved keys from global pending changes
      setGlobalPendingChanges((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        for (const key of restartRequiredSet) {
          next.delete(key);
        }
        return next;
      });
    }
  };

  const handleKeypress = (key: Key, activeItem?: SettingItem): boolean => {
    const { name } = key;

    // If editing, capture input and control keys
    if (editingKey) {
      const definition = getSettingDefinition(editingKey);
      const type = definition?.type;

      if (key.name === 'paste' && key.sequence) {
        let pasted = key.sequence;
        if (type === 'number') {
          pasted = key.sequence.replace(/[^0-9\-+.]/g, '');
        }
        if (pasted) {
          setEditBuffer((b) => {
            const before = cpSlice(b, 0, editCursorPos);
            const after = cpSlice(b, editCursorPos);
            return before + pasted + after;
          });
          setEditCursorPos((pos) => pos + cpLen(pasted));
        }
        return true;
      }
      if (name === 'backspace' || name === 'delete') {
        if (name === 'backspace' && editCursorPos > 0) {
          setEditBuffer((b) => {
            const before = cpSlice(b, 0, editCursorPos - 1);
            const after = cpSlice(b, editCursorPos);
            return before + after;
          });
          setEditCursorPos((pos) => pos - 1);
        } else if (name === 'delete' && editCursorPos < cpLen(editBuffer)) {
          setEditBuffer((b) => {
            const before = cpSlice(b, 0, editCursorPos);
            const after = cpSlice(b, editCursorPos + 1);
            return before + after;
          });
          // Cursor position stays the same for delete
        }
        return true;
      }
      if (keyMatchers[Command.ESCAPE](key)) {
        commitEdit(editingKey);
        return true;
      }
      if (keyMatchers[Command.RETURN](key)) {
        commitEdit(editingKey);
        return true;
      }

      let ch = key.sequence;
      let isValidChar = false;
      if (type === 'number') {
        // Allow digits, minus, plus, and dot.
        isValidChar = /[0-9\-+.]/.test(ch);
      } else {
        ch = stripUnsafeCharacters(ch);
        // For strings, allow any single character that isn't a control
        // sequence.
        isValidChar = ch.length === 1;
      }

      if (isValidChar) {
        setEditBuffer((currentBuffer) => {
          const beforeCursor = cpSlice(currentBuffer, 0, editCursorPos);
          const afterCursor = cpSlice(currentBuffer, editCursorPos);
          return beforeCursor + ch + afterCursor;
        });
        setEditCursorPos((pos) => pos + 1);
        return true;
      }

      // Arrow key navigation
      if (name === 'left') {
        setEditCursorPos((pos) => Math.max(0, pos - 1));
        return true;
      }
      if (name === 'right') {
        setEditCursorPos((pos) => Math.min(cpLen(editBuffer), pos + 1));
        return true;
      }
      // Home and End keys
      if (keyMatchers[Command.HOME](key)) {
        setEditCursorPos(0);
        return true;
      }
      if (keyMatchers[Command.END](key)) {
        setEditCursorPos(cpLen(editBuffer));
        return true;
      }
      // Block other keys while editing
      return true;
    }

    if (
      activeItem &&
      /^[0-9]$/.test(key.sequence || '') &&
      activeItem.type === 'number'
    ) {
      startEditing(activeItem.value, key.sequence);
      return true;
    }

    return false;
  };

  const renderValue = (item: SettingItem, isActive: boolean) => {
    const scopeSettings = settings.forScope(selectedScope).settings;
    const mergedSettings = settings.merged;

    let displayValue: string;
    if (editingKey === item.value) {
      // Show edit buffer with advanced cursor highlighting
      if (cursorVisible && editCursorPos < cpLen(editBuffer)) {
        // Cursor is in the middle or at start of text
        const beforeCursor = cpSlice(editBuffer, 0, editCursorPos);
        const atCursor = cpSlice(editBuffer, editCursorPos, editCursorPos + 1);
        const afterCursor = cpSlice(editBuffer, editCursorPos + 1);
        displayValue = beforeCursor + chalk.inverse(atCursor) + afterCursor;
      } else if (editCursorPos >= cpLen(editBuffer)) {
        // Cursor is at the end - show inverted space
        displayValue = editBuffer + (cursorVisible ? chalk.inverse(' ') : ' ');
      } else {
        // Cursor not visible
        displayValue = editBuffer;
      }
    } else if (item.type === 'number' || item.type === 'string') {
      // For numbers/strings, get the actual current value from pending settings
      const path = item.value.split('.');
      const currentValue = getNestedValue(pendingSettings, path);

      const defaultValue = getEffectiveDefaultValue(item.value, config);

      if (currentValue !== undefined && currentValue !== null) {
        displayValue = String(currentValue);
      } else {
        displayValue =
          defaultValue !== undefined && defaultValue !== null
            ? String(defaultValue)
            : '';
      }

      // Add * if value differs from default OR if currently being modified
      const isModified = modifiedSettings.has(item.value);
      const effectiveCurrentValue =
        currentValue !== undefined && currentValue !== null
          ? currentValue
          : defaultValue;
      const isDifferentFromDefault = effectiveCurrentValue !== defaultValue;

      if (isDifferentFromDefault || isModified) {
        displayValue += '*';
      }
    } else {
      // For booleans and other types, use existing logic
      displayValue = getDisplayValue(
        item.value,
        scopeSettings,
        mergedSettings,
        modifiedSettings,
        pendingSettings,
      );
    }
    const shouldBeGreyedOut = isDefaultValue(item.value, scopeSettings);

    return (
      <Text
        color={
          isActive
            ? theme.status.success
            : shouldBeGreyedOut
              ? theme.text.secondary
              : theme.text.primary
        }
      >
        {displayValue}
      </Text>
    );
  };

  return (
    <BaseSettingsDialog<SettingItem>
      title="Settings"
      items={items}
      renderValue={renderValue}
      onItemAction={(item) => {
        if (item.type === 'number' || item.type === 'string') {
          startEditing(item.value);
        } else {
          toggleItem(item.value);
        }
      }}
      onCancel={() => {
        if (editingKey) {
          commitEdit(editingKey);
        } else {
          saveRestartRequiredSettings();
          onSelect(undefined, selectedScope);
        }
      }}
      searchable
      onSearchChange={setSearchQuery}
      showScopeSelection
      selectedScope={selectedScope}
      onScopeChange={setSelectedScope}
      showRestartPrompt={showRestartPrompt}
      onRestartRequest={() => {
        setShowRestartPrompt(false);
        if (onRestartRequest) onRestartRequest();
      }}
      availableTerminalHeight={availableTerminalHeight}
      onKeypress={handleKeypress}
      isEditing={!!editingKey}
    />
  );
}
