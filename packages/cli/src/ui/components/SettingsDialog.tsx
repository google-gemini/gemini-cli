/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import {
  LoadedSettings,
  SettingScope,
  Settings,
} from '../../config/settings.js';
import {
  getScopeItems,
  getScopeMessageForSetting,
} from '../../utils/dialogScopeUtils.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import {
  getDialogSettingKeys,
  getSettingValue,
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
} from '../../utils/settingsUtils.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import chalk from 'chalk';
import { cpSlice, cpLen } from '../utils/textUtils.js';

interface SettingsDialogProps {
  settings: LoadedSettings;
  onSelect: (settingName: string | undefined, scope: SettingScope) => void;
  onRestartRequest?: () => void;
}

const maxItemsToShow = 8;

export function SettingsDialog({
  settings,
  onSelect,
  onRestartRequest,
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

  // Track restart-required settings across scope changes
  const [restartRequiredSettings, setRestartRequiredSettings] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    setPendingSettings(
      structuredClone(settings.forScope(selectedScope).settings),
    );
    // Don't reset modifiedSettings when scope changes - preserve user's pending changes
    if (restartRequiredSettings.size === 0) {
      setShowRestartPrompt(false);
    }
  }, [selectedScope, settings, restartRequiredSettings]);

  // Clear modified settings when scope changes to start fresh
  useEffect(() => {
    setModifiedSettings(new Set());
  }, [selectedScope]);

  const generateSettingsItems = () => {
    const settingKeys = getDialogSettingKeys();

    return settingKeys.map((key: string) => {
      const definition = getSettingDefinition(key);

      return {
        label: definition?.label || key,
        value: key,
        type: definition?.type,
        toggle: () => {
          if (definition?.type !== 'boolean') {
            // For non-boolean (e.g., number) items, toggle will be handled via edit mode.
            return;
          }
          const currentValue = getSettingValue(key, pendingSettings, {});
          const newValue = !currentValue;

          setPendingSettings((prev) =>
            setPendingSettingValue(key, newValue, prev),
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
            if (key === 'vimMode' && newValue !== vimEnabled) {
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
          }
        },
      };
    });
  };

  const items = generateSettingsItems();

  // Number edit state
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

  const startEditingNumber = (key: string, initial?: string) => {
    setEditingKey(key);
    const initialValue = initial ?? '';
    setEditBuffer(initialValue);
    setEditCursorPos(cpLen(initialValue)); // Position cursor at end of initial value
  };

  const commitNumberEdit = (key: string) => {
    if (editBuffer.trim() === '') {
      // Nothing entered; cancel edit
      setEditingKey(null);
      setEditBuffer('');
      setEditCursorPos(0);
      return;
    }
    const parsed = Number(editBuffer.trim());
    if (Number.isNaN(parsed)) {
      // Invalid number; cancel edit
      setEditingKey(null);
      setEditBuffer('');
      setEditCursorPos(0);
      return;
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
    }

    setEditingKey(null);
    setEditBuffer('');
    setEditCursorPos(0);
  };

  // Scope selector items
  const scopeItems = getScopeItems();

  const handleScopeHighlight = (scope: SettingScope) => {
    setSelectedScope(scope);
  };

  const handleScopeSelect = (scope: SettingScope) => {
    handleScopeHighlight(scope);
    setFocusSection('settings');
  };

  // Scroll logic for settings
  const visibleItems = items.slice(scrollOffset, scrollOffset + maxItemsToShow);
  // Always show arrows for consistent UI and to indicate circular navigation
  const showScrollUp = true;
  const showScrollDown = true;

  useKeypress(
    (key) => {
      const { name, ctrl } = key;
      if (name === 'tab') {
        setFocusSection((prev) => (prev === 'settings' ? 'scope' : 'settings'));
      }
      if (focusSection === 'settings') {
        // If editing a number, capture numeric input and control keys
        if (editingKey) {
          if (key.paste && key.sequence) {
            const pasted = key.sequence.replace(/[^0-9\-+.]/g, '');
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
            commitNumberEdit(editingKey);
            return;
          }
          if (name === 'return') {
            commitNumberEdit(editingKey);
            return;
          }
          // Allow digits, minus, plus, and dot
          const ch = key.sequence;
          if (/[0-9\-+.]/.test(ch)) {
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
            commitNumberEdit(editingKey);
          }
          const newIndex =
            activeSettingIndex > 0 ? activeSettingIndex - 1 : items.length - 1;
          setActiveSettingIndex(newIndex);
          // Adjust scroll offset for wrap-around
          if (newIndex === items.length - 1) {
            setScrollOffset(Math.max(0, items.length - maxItemsToShow));
          } else if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
        } else if (name === 'down' || name === 'j') {
          // If editing, commit first
          if (editingKey) {
            commitNumberEdit(editingKey);
          }
          const newIndex =
            activeSettingIndex < items.length - 1 ? activeSettingIndex + 1 : 0;
          setActiveSettingIndex(newIndex);
          // Adjust scroll offset for wrap-around
          if (newIndex === 0) {
            setScrollOffset(0);
          } else if (newIndex >= scrollOffset + maxItemsToShow) {
            setScrollOffset(newIndex - maxItemsToShow + 1);
          }
        } else if (name === 'return' || name === 'space') {
          const currentItem = items[activeSettingIndex];
          if (currentItem?.type === 'number') {
            startEditingNumber(currentItem.value);
          } else {
            currentItem?.toggle();
          }
        } else if (/^[0-9]$/.test(key.sequence || '') && !editingKey) {
          const currentItem = items[activeSettingIndex];
          if (currentItem?.type === 'number') {
            startEditingNumber(currentItem.value, key.sequence);
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
            } else if (defType === 'number') {
              if (typeof defaultValue === 'number') {
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
                  : typeof defaultValue === 'number'
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
        }

        setShowRestartPrompt(false);
        setRestartRequiredSettings(new Set()); // Clear restart-required settings
        if (onRestartRequest) onRestartRequest();
      }
      if (name === 'escape') {
        if (editingKey) {
          commitNumberEdit(editingKey);
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
      borderColor={Colors.Gray}
      flexDirection="row"
      padding={1}
      width="100%"
      height="100%"
    >
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color={Colors.AccentBlue}>
          Settings
        </Text>
        <Box height={1} />
        {showScrollUp && <Text color={Colors.Gray}>▲</Text>}
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
              const atCursor = cpSlice(editBuffer, editCursorPos, editCursorPos + 1);
              const afterCursor = cpSlice(editBuffer, editCursorPos + 1);
              displayValue = beforeCursor + chalk.inverse(atCursor) + afterCursor;
            } else if (cursorVisible && editCursorPos >= cpLen(editBuffer)) {
              // Cursor is at the end - show inverted space
              displayValue = editBuffer + chalk.inverse(' ');
            } else {
              // Cursor not visible
              displayValue = editBuffer;
            }
          } else if (item.type === 'number') {
            // For numbers, get the actual current value from pending settings
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
                  <Text color={isActive ? Colors.AccentGreen : Colors.Gray}>
                    {isActive ? '●' : ''}
                  </Text>
                </Box>
                <Box minWidth={50}>
                  <Text
                    color={isActive ? Colors.AccentGreen : Colors.Foreground}
                  >
                    {item.label}
                    {scopeMessage && (
                      <Text color={Colors.Gray}> {scopeMessage}</Text>
                    )}
                  </Text>
                </Box>
                <Box minWidth={3} />
                <Text
                  color={
                    isActive
                      ? Colors.AccentGreen
                      : shouldBeGreyedOut
                        ? Colors.Gray
                        : Colors.Foreground
                  }
                >
                  {displayValue}
                </Text>
              </Box>
              <Box height={1} />
            </React.Fragment>
          );
        })}
        {showScrollDown && <Text color={Colors.Gray}>▼</Text>}

        <Box height={1} />

        <Box marginTop={1} flexDirection="column">
          <Text bold={focusSection === 'scope'} wrap="truncate">
            {focusSection === 'scope' ? '> ' : '  '}Apply To
          </Text>
          <RadioButtonSelect
            items={scopeItems}
            initialIndex={0}
            onSelect={handleScopeSelect}
            onHighlight={handleScopeHighlight}
            isFocused={focusSection === 'scope'}
            showNumbers={focusSection === 'scope'}
          />
        </Box>

        <Box height={1} />
        <Text color={Colors.Gray}>
          (Use Enter to select, Tab to change focus)
        </Text>
        {showRestartPrompt && (
          <Text color={Colors.AccentYellow}>
            To see changes, Gemini CLI must be restarted. Press r to exit and
            apply changes now.
          </Text>
        )}
      </Box>
    </Box>
  );
}
