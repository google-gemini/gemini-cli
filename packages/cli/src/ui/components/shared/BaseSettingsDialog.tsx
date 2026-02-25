/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { theme } from '../../semantic-colors.js';
import type { LoadableSettingScope } from '../../../config/settings.js';
import { getScopeItems } from '../../../utils/dialogScopeUtils.js';
import { RadioButtonSelect } from './RadioButtonSelect.js';
import { TextInput } from './TextInput.js';
import type { TextBuffer } from './text-buffer.js';
import {
  cpSlice,
  cpLen,
  stripUnsafeCharacters,
  cpIndexToOffset,
} from '../../utils/textUtils.js';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { keyMatchers, Command } from '../../keyMatchers.js';

/**
 * Represents a single item in the settings dialog.
 */
export interface SettingsDialogItem {
  /** Unique identifier for the item */
  key: string;
  /** Display label */
  label: string;
  /** Optional description below label */
  description?: string;
  /** Item type for determining interaction behavior */
  type: 'boolean' | 'number' | 'string' | 'enum';
  /** Pre-formatted display value (with * if modified) */
  displayValue: string;
  /** Grey out value (at default) */
  isGreyedOut?: boolean;
  /** Scope message e.g., "(Modified in Workspace)" */
  scopeMessage?: string;
  /** Raw value for edit mode initialization */
  rawValue?: string | number | boolean;
}

/**
 * Props for BaseSettingsDialog component.
 */
export interface BaseSettingsDialogProps {
  // Header
  /** Dialog title displayed at the top */
  title: string;
  /** Optional border color for the dialog */
  borderColor?: string;

  // Search (optional feature)
  /** Whether to show the search input. Default: true */
  searchEnabled?: boolean;
  /** Placeholder text for search input. Default: "Search to filter" */
  searchPlaceholder?: string;
  /** Text buffer for search input */
  searchBuffer?: TextBuffer;

  // Items - parent provides the list
  /** List of items to display */
  items: SettingsDialogItem[];

  // Scope selector
  /** Whether to show the scope selector. Default: true */
  showScopeSelector?: boolean;
  /** Currently selected scope */
  selectedScope: LoadableSettingScope;
  /** Callback when scope changes */
  onScopeChange?: (scope: LoadableSettingScope) => void;

  // Layout
  /** Maximum number of items to show at once */
  maxItemsToShow: number;
  /** Maximum label width for alignment */
  maxLabelWidth?: number;

  // Action callbacks
  /** Called when a boolean/enum item is toggled */
  onItemToggle: (key: string, item: SettingsDialogItem) => void;
  /** Called when edit mode is committed with new value */
  onEditCommit: (
    key: string,
    newValue: string,
    item: SettingsDialogItem,
  ) => void;
  /** Called when Ctrl+C is pressed to clear/reset an item */
  onItemClear: (key: string, item: SettingsDialogItem) => void;
  /** Called when dialog should close */
  onClose: () => void;
  /** Optional custom key handler for parent-specific keys. Return true if handled. */
  onKeyPress?: (
    key: Key,
    currentItem: SettingsDialogItem | undefined,
  ) => boolean;

  // Optional extra content below help text (for restart prompt, etc.)
  /** Optional footer content (e.g., restart prompt) */
  footerContent?: React.ReactNode;
}

/**
 * A base settings dialog component that handles rendering, layout, and keyboard navigation.
 * Parent components handle business logic (saving, filtering, etc.) via callbacks.
 */
export function BaseSettingsDialog({
  title,
  borderColor,
  searchEnabled = true,
  searchPlaceholder = 'Search to filter',
  searchBuffer,
  items,
  showScopeSelector = true,
  selectedScope,
  onScopeChange,
  maxItemsToShow,
  maxLabelWidth,
  onItemToggle,
  onEditCommit,
  onItemClear,
  onClose,
  onKeyPress,
  footerContent,
}: BaseSettingsDialogProps): React.JSX.Element {
  // Internal state
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [focusSection, setFocusSection] = useState<'settings' | 'scope'>(
    'settings',
  );
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState('');
  const [editCursorPos, setEditCursorPos] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);

  const prevItemsRef = useRef(items);

  // Preserve focus when items change (e.g., search filter)
  useEffect(() => {
    const prevItems = prevItemsRef.current;
    if (prevItems !== items) {
      const prevActiveItem = prevItems[activeIndex];
      if (prevActiveItem) {
        const newIndex = items.findIndex((i) => i.key === prevActiveItem.key);
        if (newIndex !== -1) {
          // Item still exists in the filtered list, keep focus on it
          setActiveIndex(newIndex);
          // Adjust scroll offset to ensure the item is visible
          let newScroll = scrollOffset;
          if (newIndex < scrollOffset) newScroll = newIndex;
          else if (newIndex >= scrollOffset + maxItemsToShow)
            newScroll = newIndex - maxItemsToShow + 1;

          const maxScroll = Math.max(0, items.length - maxItemsToShow);
          setScrollOffset(Math.min(newScroll, maxScroll));
        } else {
          // Item was filtered out, reset to the top
          setActiveIndex(0);
          setScrollOffset(0);
        }
      } else {
        setActiveIndex(0);
        setScrollOffset(0);
      }
      prevItemsRef.current = items;
    }
  }, [items, activeIndex, scrollOffset, maxItemsToShow]);

  // Cursor blink effect
  useEffect(() => {
    if (!editingKey) return;
    setCursorVisible(true);
    const interval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 500);
    return () => clearInterval(interval);
  }, [editingKey]);

  // Ensure focus stays on settings when scope selection is hidden
  useEffect(() => {
    if (!showScopeSelector && focusSection === 'scope') {
      setFocusSection('settings');
    }
  }, [showScopeSelector, focusSection]);

  // Scope selector items
  const scopeItems = getScopeItems().map((item) => ({
    ...item,
    key: item.value,
  }));

  // Calculate visible items based on scroll offset
  const visibleItems = items.slice(scrollOffset, scrollOffset + maxItemsToShow);

  // Show scroll indicators if there are more items than can be displayed
  const showScrollUp = items.length > maxItemsToShow;
  const showScrollDown = items.length > maxItemsToShow;

  // Get current item
  const currentItem = items[activeIndex];

  // Start editing a field
  const startEditing = useCallback((key: string, initialValue: string) => {
    setEditingKey(key);
    setEditBuffer(initialValue);
    setEditCursorPos(cpLen(initialValue));
    setCursorVisible(true);
  }, []);

  // Commit edit and exit edit mode
  const commitEdit = useCallback(() => {
    if (editingKey && currentItem) {
      onEditCommit(editingKey, editBuffer, currentItem);
    }
    setEditingKey(null);
    setEditBuffer('');
    setEditCursorPos(0);
  }, [editingKey, editBuffer, currentItem, onEditCommit]);

  // Handle scope highlight (for RadioButtonSelect)
  const handleScopeHighlight = useCallback(
    (scope: LoadableSettingScope) => {
      onScopeChange?.(scope);
    },
    [onScopeChange],
  );

  // Handle scope select (for RadioButtonSelect)
  const handleScopeSelect = useCallback(
    (scope: LoadableSettingScope) => {
      onScopeChange?.(scope);
    },
    [onScopeChange],
  );

  // Keyboard handling
  useKeypress(
    (key: Key) => {
      // Let parent handle custom keys first
      if (onKeyPress?.(key, currentItem)) {
        return;
      }

      // Edit mode handling
      if (editingKey) {
        const item = items.find((i) => i.key === editingKey);
        const type = item?.type ?? 'string';

        // Navigation within edit buffer
        if (keyMatchers[Command.MOVE_LEFT](key)) {
          setEditCursorPos((p) => Math.max(0, p - 1));
          return;
        }
        if (keyMatchers[Command.MOVE_RIGHT](key)) {
          setEditCursorPos((p) => Math.min(cpLen(editBuffer), p + 1));
          return;
        }
        if (keyMatchers[Command.HOME](key)) {
          setEditCursorPos(0);
          return;
        }
        if (keyMatchers[Command.END](key)) {
          setEditCursorPos(cpLen(editBuffer));
          return;
        }

        // Backspace
        if (keyMatchers[Command.DELETE_CHAR_LEFT](key)) {
          if (editCursorPos > 0) {
            setEditBuffer((b) => {
              const before = cpSlice(b, 0, editCursorPos - 1);
              const after = cpSlice(b, editCursorPos);
              return before + after;
            });
            setEditCursorPos((p) => p - 1);
          }
          return;
        }

        // Delete
        if (keyMatchers[Command.DELETE_CHAR_RIGHT](key)) {
          if (editCursorPos < cpLen(editBuffer)) {
            setEditBuffer((b) => {
              const before = cpSlice(b, 0, editCursorPos);
              const after = cpSlice(b, editCursorPos + 1);
              return before + after;
            });
          }
          return;
        }

        // Escape in edit mode - commit (consistent with SettingsDialog)
        if (keyMatchers[Command.ESCAPE](key)) {
          commitEdit();
          return;
        }

        // Enter in edit mode - commit
        if (keyMatchers[Command.RETURN](key)) {
          commitEdit();
          return;
        }

        // Up/Down in edit mode - commit and navigate
        if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
          commitEdit();
          const newIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
          setActiveIndex(newIndex);
          if (newIndex === items.length - 1) {
            setScrollOffset(Math.max(0, items.length - maxItemsToShow));
          } else if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
          return;
        }
        if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
          commitEdit();
          const newIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
          setActiveIndex(newIndex);
          if (newIndex === 0) {
            setScrollOffset(0);
          } else if (newIndex >= scrollOffset + maxItemsToShow) {
            setScrollOffset(newIndex - maxItemsToShow + 1);
          }
          return;
        }

        // Character input
        let ch = key.sequence;
        let isValidChar = false;
        if (type === 'number') {
          isValidChar = /[0-9\-+.]/.test(ch);
        } else {
          isValidChar = ch.length === 1 && ch.charCodeAt(0) >= 32;
          // Sanitize string input to prevent unsafe characters
          ch = stripUnsafeCharacters(ch);
        }

        if (isValidChar && ch.length > 0) {
          setEditBuffer((b) => {
            const before = cpSlice(b, 0, editCursorPos);
            const after = cpSlice(b, editCursorPos);
            return before + ch + after;
          });
          setEditCursorPos((p) => p + 1);
        }
        return;
      }

      // Not in edit mode - handle navigation and actions
      if (focusSection === 'settings') {
        // Up/Down navigation with wrap-around
        if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
          const newIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
          setActiveIndex(newIndex);
          if (newIndex === items.length - 1) {
            setScrollOffset(Math.max(0, items.length - maxItemsToShow));
          } else if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
          return true;
        }
        if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
          const newIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
          setActiveIndex(newIndex);
          if (newIndex === 0) {
            setScrollOffset(0);
          } else if (newIndex >= scrollOffset + maxItemsToShow) {
            setScrollOffset(newIndex - maxItemsToShow + 1);
          }
          return true;
        }

        // Enter - toggle or start edit
        if (keyMatchers[Command.RETURN](key) && currentItem) {
          if (currentItem.type === 'boolean' || currentItem.type === 'enum') {
            onItemToggle(currentItem.key, currentItem);
          } else {
            // Start editing for string/number
            const rawVal = currentItem.rawValue;
            const initialValue = rawVal !== undefined ? String(rawVal) : '';
            startEditing(currentItem.key, initialValue);
          }
          return true;
        }

        // Ctrl+L - clear/reset to default (using only Ctrl+L to avoid Ctrl+C exit conflict)
        if (keyMatchers[Command.CLEAR_SCREEN](key) && currentItem) {
          onItemClear(currentItem.key, currentItem);
          return true;
        }

        // Number keys for quick edit on number fields
        if (currentItem?.type === 'number' && /^[0-9]$/.test(key.sequence)) {
          startEditing(currentItem.key, key.sequence);
          return true;
        }
      }

      // Tab - switch focus section
      if (key.name === 'tab' && showScopeSelector) {
        setFocusSection((s) => (s === 'settings' ? 'scope' : 'settings'));
        return;
      }

      // Escape - close dialog
      if (keyMatchers[Command.ESCAPE](key)) {
        onClose();
        return;
      }

      return;
    },
    {
      isActive: true,
      priority: focusSection === 'settings' && !editingKey,
    },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor ?? theme.border.default}
      flexDirection="row"
      padding={1}
      width="100%"
      height="100%"
    >
      <Box flexDirection="column" flexGrow={1}>
        {/* Title */}
        <Box marginX={1}>
          <Text
            bold={focusSection === 'settings' && !editingKey}
            wrap="truncate"
          >
            {focusSection === 'settings' ? '> ' : '  '}
            {title}{' '}
          </Text>
        </Box>

        {/* Search input (if enabled) */}
        {searchEnabled && searchBuffer && (
          <Box
            borderStyle="round"
            borderColor={
              editingKey
                ? theme.border.default
                : focusSection === 'settings'
                  ? theme.border.focused
                  : theme.border.default
            }
            paddingX={1}
            height={3}
            marginTop={1}
          >
            <TextInput
              focus={focusSection === 'settings' && !editingKey}
              buffer={searchBuffer}
              placeholder={searchPlaceholder}
            />
          </Box>
        )}

        <Box height={1} />

        {/* Items list */}
        {visibleItems.length === 0 ? (
          <Box marginX={1} height={1} flexDirection="column">
            <Text color={theme.text.secondary}>No matches found.</Text>
          </Box>
        ) : (
          <>
            {showScrollUp && (
              <Box marginX={1}>
                <Text color={theme.text.secondary}>▲</Text>
              </Box>
            )}
            {visibleItems.map((item, idx) => {
              const globalIndex = idx + scrollOffset;
              const isActive =
                focusSection === 'settings' && activeIndex === globalIndex;

              // Compute display value with edit mode cursor
              let displayValue: string;
              if (editingKey === item.key) {
                // Show edit buffer with cursor highlighting
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
                } else if (editCursorPos >= cpLen(editBuffer)) {
                  // Cursor is at the end - show inverted space
                  displayValue =
                    editBuffer + (cursorVisible ? chalk.inverse(' ') : ' ');
                } else {
                  // Cursor not visible
                  displayValue = editBuffer;
                }
              } else {
                displayValue = item.displayValue;
              }

              return (
                <React.Fragment key={item.key}>
                  <Box marginX={1} flexDirection="row" alignItems="flex-start">
                    <Box minWidth={2} flexShrink={0}>
                      <Text
                        color={
                          isActive ? theme.status.success : theme.text.secondary
                        }
                      >
                        {isActive ? '●' : ''}
                      </Text>
                    </Box>
                    <Box
                      flexDirection="row"
                      flexGrow={1}
                      minWidth={0}
                      alignItems="flex-start"
                    >
                      <Box
                        flexDirection="column"
                        width={maxLabelWidth}
                        minWidth={0}
                      >
                        <Text
                          color={
                            isActive ? theme.status.success : theme.text.primary
                          }
                        >
                          {item.label}
                          {item.scopeMessage && (
                            <Text color={theme.text.secondary}>
                              {' '}
                              {item.scopeMessage}
                            </Text>
                          )}
                        </Text>
                        <Text color={theme.text.secondary} wrap="truncate">
                          {item.description ?? ''}
                        </Text>
                      </Box>
                      <Box minWidth={3} />
                      <Box flexShrink={0}>
                        <Text
                          color={
                            isActive
                              ? theme.status.success
                              : item.isGreyedOut
                                ? theme.text.secondary
                                : theme.text.primary
                          }
                          terminalCursorFocus={
                            editingKey === item.key && cursorVisible
                          }
                          terminalCursorPosition={cpIndexToOffset(
                            editBuffer,
                            editCursorPos,
                          )}
                        >
                          {displayValue}
                        </Text>
                      </Box>
                    </Box>
                  </Box>
                  <Box height={1} />
                </React.Fragment>
              );
            })}
            {showScrollDown && (
              <Box marginX={1}>
                <Text color={theme.text.secondary}>▼</Text>
              </Box>
            )}
          </>
        )}

        <Box height={1} />

        {/* Scope Selection */}
        {showScopeSelector && (
          <Box marginX={1} flexDirection="column">
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
              priority={focusSection === 'scope'}
            />
          </Box>
        )}

        <Box height={1} />

        {/* Help text */}
        <Box marginX={1}>
          <Text color={theme.text.secondary}>
            (Use Enter to select, Ctrl+L to reset
            {showScopeSelector ? ', Tab to change focus' : ''}, Esc to close)
          </Text>
        </Box>

        {/* Footer content (e.g., restart prompt) */}
        {footerContent && <Box marginX={1}>{footerContent}</Box>}
      </Box>
    </Box>
  );
}
