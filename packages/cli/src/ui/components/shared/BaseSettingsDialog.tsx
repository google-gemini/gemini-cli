/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import type { LoadableSettingScope } from '../../../config/settings.js';
import { SettingScope } from '../../../config/settings.js';
import { getScopeItems } from '../../../utils/dialogScopeUtils.js';
import { RadioButtonSelect } from './RadioButtonSelect.js';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { keyMatchers, Command } from '../../keyMatchers.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useTextBuffer } from './text-buffer.js';
import { TextInput } from './TextInput.js';
import { getCachedStringWidth } from '../../utils/textUtils.js';

export interface BaseSettingsItem {
  key: string;
  label: string;
  description?: string;
  scopeMessage?: string;
}

export interface BaseSettingsDialogProps<T extends BaseSettingsItem> {
  title: string;
  items: T[];
  renderValue: (item: T, isActive: boolean) => React.ReactNode;
  onItemAction: (item: T) => void;
  onCancel: () => void;

  // Search
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearchChange?: (query: string) => void;

  // Scope
  showScopeSelection?: boolean;
  selectedScope?: LoadableSettingScope;
  onScopeChange?: (scope: LoadableSettingScope) => void;

  // Restart
  showRestartPrompt?: boolean;
  onRestartRequest?: () => void;

  // Help
  helpText?: string;

  // Height constraints
  availableTerminalHeight?: number;
  staticExtraHeight?: number;

  // Custom key handling (e.g. for inline editing)
  onKeypress?: (key: Key) => boolean; // Return true if handled
  isEditing?: boolean;
}

const MAX_ITEMS_TO_SHOW = 8;

export function BaseSettingsDialog<T extends BaseSettingsItem>({
  title,
  items,
  renderValue,
  onItemAction,
  onCancel,
  searchable = false,
  searchPlaceholder = 'Search to filter',
  onSearchChange,
  showScopeSelection = false,
  selectedScope = SettingScope.User,
  onScopeChange,
  showRestartPrompt = false,
  onRestartRequest,
  helpText,
  availableTerminalHeight,
  staticExtraHeight = 0,
  onKeypress,
  isEditing = false,
}: BaseSettingsDialogProps<T>): React.JSX.Element {
  const [focusSection, setFocusSection] = useState<'settings' | 'scope'>(
    'settings',
  );
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const { mainAreaWidth } = useUIState();
  const searchBufferWidth = mainAreaWidth - 8;
  const searchBuffer = useTextBuffer({
    initialText: '',
    initialCursorOffset: 0,
    viewport: {
      width: searchBufferWidth,
      height: 1,
    },
    isValidPath: () => false,
    singleLine: true,
    onChange: (text) => onSearchChange?.(text),
  });

  // Reset active index when items change
  useEffect(() => {
    setActiveItemIndex(0);
    setScrollOffset(0);
  }, [items.length]);

  // Height calculations
  const DIALOG_PADDING = 5;
  const TITLE_HEIGHT = 2;
  const SCROLL_ARROWS_HEIGHT = 2;
  const SPACING_HEIGHT = 1;
  const SCOPE_HEIGHT = showScopeSelection ? 4 : 0;
  const HELP_TEXT_HEIGHT = 1;
  const RESTART_PROMPT_HEIGHT = showRestartPrompt ? 1 : 0;
  const SEARCH_HEIGHT = searchable ? 4 : 0;

  let currentHeight = availableTerminalHeight
    ? availableTerminalHeight - staticExtraHeight
    : Number.MAX_SAFE_INTEGER;
  currentHeight -= 2; // Borders

  const totalFixedHeight =
    DIALOG_PADDING +
    TITLE_HEIGHT +
    SCROLL_ARROWS_HEIGHT +
    SPACING_HEIGHT +
    SCOPE_HEIGHT +
    HELP_TEXT_HEIGHT +
    RESTART_PROMPT_HEIGHT +
    SEARCH_HEIGHT;

  const availableHeightForItems = Math.max(1, currentHeight - totalFixedHeight);
  const maxVisibleItems = Math.max(1, Math.floor(availableHeightForItems / 3));

  const effectiveMaxItemsToShow = availableTerminalHeight
    ? Math.min(maxVisibleItems, items.length)
    : MAX_ITEMS_TO_SHOW;

  const visibleItems = items.slice(
    scrollOffset,
    scrollOffset + effectiveMaxItemsToShow,
  );
  const showScrollUp = items.length > effectiveMaxItemsToShow;
  const showScrollDown = items.length > effectiveMaxItemsToShow;

  const maxLabelWidth = useMemo(() => {
    let max = 0;
    for (const item of items) {
      const labelFull =
        item.label + (item.scopeMessage ? ` ${item.scopeMessage}` : '');
      const lWidth = getCachedStringWidth(labelFull);
      const dWidth = item.description
        ? getCachedStringWidth(item.description)
        : 0;
      max = Math.max(max, lWidth, dWidth);
    }
    return max;
  }, [items]);

  useKeypress(
    (key) => {
      // Custom handler takes precedence
      if (onKeypress?.(key)) {
        return;
      }

      if (keyMatchers[Command.ESCAPE](key)) {
        onCancel();
        return;
      }

      if (key.name === 'tab' && showScopeSelection && !isEditing) {
        setFocusSection((prev) => (prev === 'settings' ? 'scope' : 'settings'));
        return;
      }

      if (focusSection === 'settings') {
        if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
          const newIndex =
            activeItemIndex > 0 ? activeItemIndex - 1 : items.length - 1;
          setActiveItemIndex(newIndex);
          if (newIndex === items.length - 1) {
            setScrollOffset(
              Math.max(0, items.length - effectiveMaxItemsToShow),
            );
          } else if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
        } else if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
          const newIndex =
            activeItemIndex < items.length - 1 ? activeItemIndex + 1 : 0;
          setActiveItemIndex(newIndex);
          if (newIndex === 0) {
            setScrollOffset(0);
          } else if (newIndex >= scrollOffset + effectiveMaxItemsToShow) {
            setScrollOffset(newIndex - effectiveMaxItemsToShow + 1);
          }
        } else if (keyMatchers[Command.RETURN](key)) {
          const currentItem = items[activeItemIndex];
          if (currentItem) onItemAction(currentItem);
        }
      }

      if (showRestartPrompt && key.name === 'r' && !isEditing) {
        onRestartRequest?.();
      }
    },
    { isActive: true },
  );

  const scopeItems = getScopeItems().map((item) => ({
    ...item,
    key: item.value,
  }));

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
        <Box marginX={1}>
          <Text
            bold={focusSection === 'settings' && !isEditing}
            wrap="truncate"
          >
            {focusSection === 'settings' ? '> ' : '  '}
            {title}
          </Text>
        </Box>

        {searchable && (
          <Box
            borderStyle="round"
            borderColor={
              isEditing
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
              focus={focusSection === 'settings' && !isEditing}
              buffer={searchBuffer}
              placeholder={searchPlaceholder}
            />
          </Box>
        )}

        <Box height={1} />

        {items.length === 0 ? (
          <Box marginX={1} height={1}>
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
              const isActive =
                focusSection === 'settings' &&
                activeItemIndex === idx + scrollOffset;

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
                      <Box flexShrink={0}>{renderValue(item, isActive)}</Box>
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

        {showScopeSelection && (
          <Box marginX={1} flexDirection="column">
            <Text bold={focusSection === 'scope'} wrap="truncate">
              {focusSection === 'scope' ? '> ' : '  '}Apply To
            </Text>
            <RadioButtonSelect
              items={scopeItems}
              initialIndex={scopeItems.findIndex(
                (i) => i.value === selectedScope,
              )}
              onSelect={(scope) => {
                onScopeChange?.(scope);
                setFocusSection('settings');
              }}
              onHighlight={(scope) => onScopeChange?.(scope)}
              isFocused={focusSection === 'scope'}
              showNumbers={focusSection === 'scope'}
            />
          </Box>
        )}

        <Box height={1} />
        <Box marginX={1}>
          <Text color={theme.text.secondary}>
            {helpText ||
              `(Use Enter to select${showScopeSelection ? ', Tab to change focus' : ''}, Esc to close)`}
          </Text>
        </Box>

        {showRestartPrompt && (
          <Box marginX={1}>
            <Text color={theme.status.warning}>
              To see changes, Gemini CLI must be restarted. Press r to exit and
              apply changes now.
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
