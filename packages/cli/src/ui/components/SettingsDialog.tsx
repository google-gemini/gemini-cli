/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type { LoadedSettings, Settings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import {
  getScopeItems,
  getScopeMessageForSetting,
} from '../../utils/dialogScopeUtils.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
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
  getDefaultValue,
  setPendingSettingValueAny,
  getNestedValue,
  getEffectiveValue,
} from '../../utils/settingsUtils.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import chalk from 'chalk';
import { cpSlice, cpLen, stripUnsafeCharacters } from '../utils/textUtils.js';
import {
  type SettingsValue,
  TOGGLE_TYPES,
} from '../../config/settingsSchema.js';

interface SettingsDialogProps {
  settings: LoadedSettings;
  onSelect: (settingName: string | undefined, scope: SettingScope) => void;
  onRestartRequest?: () => void;
  availableTerminalHeight?: number;
}

const maxItemsToShow = 8;

export function SettingsDialog({
  settings,
  onSelect,
  onRestartRequest,
  availableTerminalHeight,
}: SettingsDialogProps): React.JSX.Element {
  // Get vim mode context to sync vim mode changes
  const { vimEnabled, toggleVimEnabled } = useVimMode();

  // Focus state: 'settings' or 'scope'
  const [focusSection, setFocusSection] = useState<'settings' | 'scope'>(
    'settings',
  );
  // Scope selector state (User by default)
  const [selectedScope, setSelectedScope] = useState<SettingScope>(
    SettingScope.User,
  );
  // Active indices
  const [activeSettingIndex, setActiveSettingIndex] = useState(0);
  // Scroll offset for settings
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);

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

  const generateSettingsItems = () => {
    const settingKeys = getDialogSettingKeys();

    return settingKeys.map((key: string) => {
      const definition = getSettingDefinition(key);

      return {
        label: definition?.label || key,
        value: key,
        type: definition?.type,
        toggle: () => {
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

          setPendingSettings((prev) =>
            setPendingSettingValue(key, newValue as boolean, prev),
          );

          if (!requiresRestart(key)) {
            const immediateSettings = new Set([key]);
            const immediateSettingsObject = setPendingSettingValueAny(
              key,
              newValue,
              {} as Settings,
            );

            console.log(
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
                console.error('Failed to toggle vim mode:', error);
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

            // Refresh pending settings from the saved state
            setPendingSettings(
              structuredClone(settings.forScope(selectedScope).settings),
            );
          } else {
            // For restart-required settings, track as modified
            setModifiedSettings((prev) => {
              const updated = new Set(prev).add(key);
              const needsRestart = hasRestartRequiredSettings(updated);
              console.log(
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
        },
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
      const immediateSettingsObject = setPendingSettingValueAny(
        key,
        parsed,
        {} as Settings,
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

  // Scope selector items
  const scopeItems = getScopeItems().map((item) => ({
    ...item,
    key: item.value,
  }));

  const handleScopeHighlight = (scope: SettingScope) => {
    setSelectedScope(scope);
  };

  const handleScopeSelect = (scope: SettingScope) => {
    handleScopeHighlight(scope);
    setFocusSection('settings');
  };

  // Height constraint calculations similar to ThemeDialog
  const DIALOG_PADDING = 4;
  const SETTINGS_TITLE_HEIGHT = 2; // "Settings" title + spacing
  const SCROLL_ARROWS_HEIGHT = 2; // Up and down arrows
  const SPACING_HEIGHT = 1; // Space between settings list and scope
  const SCOPE_SELECTION_HEIGHT = 4; // Apply To section height
  const BOTTOM_HELP_TEXT_HEIGHT = 1; // Help text
  const RESTART_PROMPT_HEIGHT = showRestartPrompt ? 1 : 0;

  let currentAvailableTerminalHeight =
    availableTerminalHeight ?? Number.MAX_SAFE_INTEGER;
  currentAvailableTerminalHeight -= 2; // Top and bottom borders

  // Start with basic fixed height (without scope selection)
  let totalFixedHeight =
    DIALOG_PADDING +
    SETTINGS_TITLE_HEIGHT +
    SCROLL_ARROWS_HEIGHT +
    SPACING_HEIGHT +
    BOTTOM_HELP_TEXT_HEIGHT +
    RESTART_PROMPT_HEIGHT;

  // Calculate how much space we have for settings
  let availableHeightForSettings = Math.max(
    1,
    currentAvailableTerminalHeight - totalFixedHeight,
  );

  // Each setting item takes 2 lines (the setting row + spacing)
  let maxVisibleItems = Math.max(1, Math.floor(availableHeightForSettings / 2));

  // Decide whether to show scope selection based on remaining space
  let showScopeSelection = true;

  // If we have limited height, prioritize showing more settings over scope selection
  if (availableTerminalHeight && availableTerminalHeight < 25) {
    // For very limited height, hide scope selection to show more settings
    const totalWithScope = totalFixedHeight + SCOPE_SELECTION_HEIGHT;
    const availableWithScope = Math.max(
      1,
      currentAvailableTerminalHeight - totalWithScope,
    );
    const maxItemsWithScope = Math.max(1, Math.floor(availableWithScope / 2));

    // If hiding scope selection allows us to show significantly more settings, do it
    if (maxVisibleItems > maxItemsWithScope + 1) {
      showScopeSelection = false;
    } else {
      // Otherwise include scope selection and recalculate
      totalFixedHeight += SCOPE_SELECTION_HEIGHT;
      availableHeightForSettings = Math.max(
        1,
        currentAvailableTerminalHeight - totalFixedHeight,
      );
      maxVisibleItems = Math.max(1, Math.floor(availableHeightForSettings / 2));
    }
  } else {
    // For normal height, include scope selection
    totalFixedHeight += SCOPE_SELECTION_HEIGHT;
    availableHeightForSettings = Math.max(
      1,
      currentAvailableTerminalHeight - totalFixedHeight,
    );
    maxVisibleItems = Math.max(1, Math.floor(availableHeightForSettings / 2));
  }

  // Use the calculated maxVisibleItems or fall back to the original maxItemsToShow
  const effectiveMaxItemsToShow = availableTerminalHeight
    ? Math.min(maxVisibleItems, items.length)
    : maxItemsToShow;

  // Ensure focus stays on settings when scope selection is hidden
  React.useEffect(() => {
    if (!showScopeSelection && focusSection === 'scope') {
      setFocusSection('settings');
    }
  }, [showScopeSelection, focusSection]);

  // Scroll logic for settings
  const visibleItems = items.slice(
    scrollOffset,
    scrollOffset + effectiveMaxItemsToShow,
  );
  // Show arrows if there are more items than can be displayed
  const showScrollUp = items.length > effectiveMaxItemsToShow;
  const showScrollDown = items.length > effectiveMaxItemsToShow;

  useKeypress(
    (key) => {
      const { name, ctrl } = key;
      if (name === 'tab' && showScopeSelection) {
        setFocusSection((prev) => (prev === 'settings' ? 'scope' : 'settings'));
      }
      if (focusSection === 'settings') {
        // If editing, capture input and control keys
        if (editingKey) {
          const definition = getSettingDefinition(editingKey);
          const type = definition?.type;

          if (key.paste && key.sequence) {
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
            return;
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
            return;
          }
          if (name === 'escape') {
            commitEdit(editingKey);
            return;
          }
          if (name === 'return') {
            commitEdit(editingKey);
            return;
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
            return;
          }

          // Arrow key navigation
          if (name === 'left') {
            setEditCursorPos((pos) => Math.max(0, pos - 1));
            return;
          }
          if (name === 'right') {
            setEditCursorPos((pos) => Math.min(cpLen(editBuffer), pos + 1));
            return;
          }
          // Home and End keys
          if (name === 'home') {
            setEditCursorPos(0);
            return;
          }
          if (name === 'end') {
            setEditCursorPos(cpLen(editBuffer));
            return;
          }
          // Block other keys while editing
          return;
        }
        if (name === 'up' || name === 'k') {
          // If editing, commit first
          if (editingKey) {
            commitEdit(editingKey);
          }
          const newIndex =
            activeSettingIndex > 0 ? activeSettingIndex - 1 : items.length - 1;
          setActiveSettingIndex(newIndex);
          // Adjust scroll offset for wrap-around
          if (newIndex === items.length - 1) {
            setScrollOffset(
              Math.max(0, items.length - effectiveMaxItemsToShow),
            );
          } else if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
        } else if (name === 'down' || name === 'j') {
          // If editing, commit first
          if (editingKey) {
            commitEdit(editingKey);
          }
          const newIndex =
            activeSettingIndex < items.length - 1 ? activeSettingIndex + 1 : 0;
          setActiveSettingIndex(newIndex);
          // Adjust scroll offset for wrap-around
          if (newIndex === 0) {
            setScrollOffset(0);
          } else if (newIndex >= scrollOffset + effectiveMaxItemsToShow) {
            setScrollOffset(newIndex - effectiveMaxItemsToShow + 1);
          }
        } else if (name === 'return' || name === 'space') {
          const currentItem = items[activeSettingIndex];
          if (
            currentItem?.type === 'number' ||
            currentItem?.type === 'string'
          ) {
            startEditing(currentItem.value);
          } else {
            currentItem?.toggle();
          }
        } else if (/^[0-9]$/.test(key.sequence || '') && !editingKey) {
          const currentItem = items[activeSettingIndex];
          if (currentItem?.type === 'number') {
            startEditing(currentItem.value, key.sequence);
          }
        } else if (ctrl && (name === 'c' || name === 'l')) {
          // Ctrl+C or Ctrl+L: Clear current setting and reset to default
          const currentSetting = items[activeSettingIndex];
          if (currentSetting) {
            const defaultValue = getDefaultValue(currentSetting.value);
            const defType = currentSetting.type;
            if (defType === 'boolean') {
              const booleanDefaultValue =
                typeof defaultValue === 'boolean' ? defaultValue : false;
              setPendingSettings((prev) =>
                setPendingSettingValue(
                  currentSetting.value,
                  booleanDefaultValue,
                  prev,
                ),
              );
            } else if (defType === 'number' || defType === 'string') {
              if (
                typeof defaultValue === 'number' ||
                typeof defaultValue === 'string'
              ) {
                setPendingSettings((prev) =>
                  setPendingSettingValueAny(
                    currentSetting.value,
                    defaultValue,
                    prev,
                  ),
                );
              }
            }

            // Remove from modified settings since it's now at default
            setModifiedSettings((prev) => {
              const updated = new Set(prev);
              updated.delete(currentSetting.value);
              return updated;
            });

            // Remove from restart-required settings if it was there
            setRestartRequiredSettings((prev) => {
              const updated = new Set(prev);
              updated.delete(currentSetting.value);
              return updated;
            });

            // If this setting doesn't require restart, save it immediately
            if (!requiresRestart(currentSetting.value)) {
              const immediateSettings = new Set([currentSetting.value]);
              const toSaveValue =
                currentSetting.type === 'boolean'
                  ? typeof defaultValue === 'boolean'
                    ? defaultValue
                    : false
                  : typeof defaultValue === 'number' ||
                      typeof defaultValue === 'string'
                    ? defaultValue
                    : undefined;
              const immediateSettingsObject =
                toSaveValue !== undefined
                  ? setPendingSettingValueAny(
                      currentSetting.value,
                      toSaveValue,
                      {} as Settings,
                    )
                  : ({} as Settings);

              saveModifiedSettings(
                immediateSettings,
                immediateSettingsObject,
                settings,
                selectedScope,
              );

              // Remove from global pending changes if present
              setGlobalPendingChanges((prev) => {
                if (!prev.has(currentSetting.value)) return prev;
                const next = new Map(prev);
                next.delete(currentSetting.value);
                return next;
              });
            } else {
              // Track default reset as a pending change if restart required
              if (
                (currentSetting.type === 'boolean' &&
                  typeof defaultValue === 'boolean') ||
                (currentSetting.type === 'number' &&
                  typeof defaultValue === 'number') ||
                (currentSetting.type === 'string' &&
                  typeof defaultValue === 'string')
              ) {
                setGlobalPendingChanges((prev) => {
                  const next = new Map(prev);
                  next.set(currentSetting.value, defaultValue as PendingValue);
                  return next;
                });
              }
            }
          }
        }
      }
      if (showRestartPrompt && name === 'r') {
        // Only save settings that require restart (non-restart settings were already saved immediately)
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

        setShowRestartPrompt(false);
        setRestartRequiredSettings(new Set()); // Clear restart-required settings
        if (onRestartRequest) onRestartRequest();
      }
      if (name === 'escape') {
        if (editingKey) {
          commitEdit(editingKey);
        } else {
          onSelect(undefined, selectedScope);
        }
      }
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="row"
      padding={1}
      width="100%"
      height="100%"
    >
      <Box flexDirection="column" flexGrow={1}>
        <Text bold={focusSection === 'settings'} wrap="truncate">
          {focusSection === 'settings' ? '> ' : '  '}Settings
        </Text>
        <Box height={1} />
        {showScrollUp && <Text color={theme.text.secondary}>▲</Text>}
        {visibleItems.map((item, idx) => {
          const isActive =
            focusSection === 'settings' &&
            activeSettingIndex === idx + scrollOffset;

          const scopeSettings = settings.forScope(selectedScope).settings;
          const mergedSettings = settings.merged;

          let displayValue: string;
          if (editingKey === item.value) {
            // Show edit buffer with advanced cursor highlighting
            if (cursorVisible && editCursorPos < cpLen(editBuffer)) {
              // Cursor is in the middle or at start of text
              const beforeCursor = cpSlice(editBuffer, 0, editCursorPos);
              const atCursor = cpSlice(
                editBuffer,
                editCursorPos,
                editCursorPos + 1,
              );
              const afterCursor = cpSlice(editBuffer, editCursorPos + 1);
              displayValue =
                beforeCursor + chalk.inverse(atCursor) + afterCursor;
            } else if (cursorVisible && editCursorPos >= cpLen(editBuffer)) {
              // Cursor is at the end - show inverted space
              displayValue = editBuffer + chalk.inverse(' ');
            } else {
              // Cursor not visible
              displayValue = editBuffer;
            }
          } else if (item.type === 'number' || item.type === 'string') {
            // For numbers/strings, get the actual current value from pending settings
            const path = item.value.split('.');
            const currentValue = getNestedValue(pendingSettings, path);

            const defaultValue = getDefaultValue(item.value);

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
            const isDifferentFromDefault =
              effectiveCurrentValue !== defaultValue;

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

          // Generate scope message for this setting
          const scopeMessage = getScopeMessageForSetting(
            item.value,
            selectedScope,
            settings,
          );

          return (
            <React.Fragment key={item.value}>
              <Box flexDirection="row" alignItems="center">
                <Box minWidth={2} flexShrink={0}>
                  <Text
                    color={
                      isActive ? theme.status.success : theme.text.secondary
                    }
                  >
                    {isActive ? '●' : ''}
                  </Text>
                </Box>
                <Box minWidth={50}>
                  <Text
                    color={isActive ? theme.status.success : theme.text.primary}
                  >
                    {item.label}
                    {scopeMessage && (
                      <Text color={theme.text.secondary}> {scopeMessage}</Text>
                    )}
                  </Text>
                </Box>
                <Box minWidth={3} />
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
              </Box>
              <Box height={1} />
            </React.Fragment>
          );
        })}
        {showScrollDown && <Text color={theme.text.secondary}>▼</Text>}

        <Box height={1} />

        {/* Scope Selection - conditionally visible based on height constraints */}
        {showScopeSelection && (
          <Box marginTop={1} flexDirection="column">
            <Text bold={focusSection === 'scope'} wrap="truncate">
              {focusSection === 'scope' ? '> ' : '  '}Apply To
            </Text>
            <RadioButtonSelect
              items={scopeItems}
              initialIndex={scopeItems.findIndex(
                (item) => item.value === selectedScope,
              )}
              onSelect={handleScopeSelect}
              onHighlight={handleScopeHighlight}
              isFocused={focusSection === 'scope'}
              showNumbers={focusSection === 'scope'}
            />
          </Box>
        )}

        <Box height={1} />
        <Text color={theme.text.secondary}>
          (Use Enter to select
          {showScopeSelection ? ', Tab to change focus' : ''})
        </Text>
        {showRestartPrompt && (
          <Text color={theme.status.warning}>
            To see changes, Gemini CLI must be restarted. Press r to exit and
            apply changes now.
          </Text>
        )}
      </Box>
    </Box>
  );
}
