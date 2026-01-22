/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import type { LoadableSettingScope } from '../../../config/settings.js';
import { RadioButtonSelect } from './RadioButtonSelect.js';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { keyMatchers, Command } from '../../keyMatchers.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { getScopeItems } from '../../../utils/dialogScopeUtils.js';
import { useTextBuffer } from './text-buffer.js';
import { TextInput } from './TextInput.js';

export interface DialogItemProps {
  /** Whether the item is currently selected/active. */
  isActive: boolean;
  /** The primary label for the item. */
  label: string;
  /** Optional description displayed below the label. */
  description?: string;
  /** The value string or component to display on the right. */
  displayValue: string | React.ReactNode;
  /** Whether the value has been modified from its default. */
  isModified?: boolean;
  /** Whether the value is explicitly set in the current scope. */
  isSetInScope?: boolean;
  /** Optional message indicating other scopes where the setting is modified. */
  scopeMessage?: string;
  /** Fixed width for the label/description column to ensure values are aligned. */
  maxLabelWidth?: number;
}

/**
 * A shared component for rendering consistent configuration fields in dialogs.
 * Handles vertical alignment of labels and descriptions, selection indicators,
 * and value-side modification stars.
 */
export const DialogItem = ({
  isActive,
  label,
  description,
  displayValue,
  isModified,
  isSetInScope,
  scopeMessage,
  maxLabelWidth,
}: DialogItemProps) => (
    <Box
      marginX={1}
      flexDirection="row"
      marginBottom={1}
      alignItems="flex-start"
    >
      <Box minWidth={2} flexShrink={0}>
        <Text color={isActive ? theme.status.success : theme.text.secondary}>
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
          flexGrow={maxLabelWidth === undefined ? 1 : 0}
        >
          <Text color={isActive ? theme.status.success : theme.text.primary}>
            {label}
            {scopeMessage && (
              <Text color={theme.text.secondary}> {scopeMessage}</Text>
            )}
          </Text>
          {description && (
            <Text color={theme.text.secondary} wrap="truncate">
              {description}
            </Text>
          )}
        </Box>
        <Box minWidth={3} />
        <Box flexShrink={0}>
          <Text
            color={
              isActive
                ? theme.status.success
                : isSetInScope
                  ? theme.text.primary
                  : theme.text.secondary
            }
          >
            {displayValue}
            {(isModified || isSetInScope) && '*'}
          </Text>
        </Box>
      </Box>
    </Box>
  );

export interface DialogFooterProps {
  /** The primary action text (e.g., 'edit' or 'select'). Defaults to 'select'. */
  action?: 'edit' | 'select';
  /** Whether to show the Tab instruction for switching sections. */
  showTabInstruction?: boolean;
  /** Whether the Escape action implies saving. Defaults to false. */
  saveOnClose?: boolean;
}

/**
 * A shared footer component for dialogs to display consistent instructional text.
 */
export const DialogFooter = ({
  action = 'select',
  showTabInstruction = true,
  saveOnClose = false,
}: DialogFooterProps) => {
  const actionText = action === 'edit' ? 'edit' : 'select';
  const closeText = saveOnClose ? 'save and close' : 'close';

  return (
    <Box marginTop={1} marginX={1}>
      <Text color={theme.text.secondary}>
        (Use Enter to {actionText}
        {showTabInstruction ? ', Tab to change focus' : ''}, Esc to {closeText})
      </Text>
    </Box>
  );
};

export interface StandardConfigDialogProps<T> {
  /** The title displayed at the top of the dialog. */
  title: string;
  /** The list of items to display. */
  items: T[];
  /** Callback to render an individual item. */
  renderItem: (
    item: T,
    isActive: boolean,
    scrollOffset: number,
  ) => React.ReactNode;
  /** Callback when the user presses Enter on an item. */
  onItemAction: (item: T) => void;
  /** Callback when the user presses Ctrl+C or Ctrl+L on an item. */
  onItemReset?: (item: T) => void;
  /** Callback when the user closes the dialog (Esc). */
  onClose: (scope: LoadableSettingScope) => void;

  /** Whether to enable the search bar. */
  enableSearch?: boolean;
  /** Callback when search query changes. */
  onSearchChange?: (query: string) => void;
  /** Initial search query. */
  searchQuery?: string;

  /** Scope selector state. */
  selectedScope: LoadableSettingScope;
  /** Callback when scope changes. */
  onScopeChange: (scope: LoadableSettingScope) => void;

  /** Optional restart prompt configuration. */
  restartProps?: {
    show: boolean;
    onRestart: () => void;
  };

  /** Whether an item is currently being edited (blocks navigation). */
  isEditing?: boolean;
  /** The index of the item currently being edited. */
  editingIndex?: number;

  /** Available terminal height for scrolling calculations. */
  availableTerminalHeight?: number;
}

const MAX_ITEMS_TO_SHOW_DEFAULT = 8;

/**
 * A generic, high-fidelity dialog component for configuration and settings.
 * Handles layout, search, scrolling, scope selection, and standard navigation.
 */
export function StandardConfigDialog<T>({
  title,
  items,
  renderItem,
  onItemAction,
  onItemReset,
  onClose,
  enableSearch = false,
  onSearchChange,
  searchQuery: initialSearchQuery = '',
  selectedScope,
  onScopeChange,
  restartProps,
  isEditing = false,
  editingIndex,
  availableTerminalHeight,
}: StandardConfigDialogProps<T>): React.JSX.Element {
  const [focusSection, setFocusSection] = useState<'items' | 'scope'>('items');
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Sync active index if editing starts externally
  useEffect(() => {
    if (editingIndex !== undefined && editingIndex !== activeItemIndex) {
      setActiveItemIndex(editingIndex);
    }
  }, [editingIndex, activeItemIndex]);

  // Search buffer management
  const { mainAreaWidth } = useUIState();
  const searchBuffer = useTextBuffer({
    initialText: initialSearchQuery,
    viewport: { width: mainAreaWidth - 8, height: 1 },
    isValidPath: () => false,
    singleLine: true,
    onChange: onSearchChange,
  });

  // Height and scrolling logic
  const DIALOG_PADDING = 5;
  const TITLE_HEIGHT = 2;
  const SEARCH_BAR_HEIGHT = enableSearch ? 4 : 0;
  const SCROLL_ARROWS_HEIGHT = 2;
  const SPACING_HEIGHT = 1;
  const SCOPE_SELECTION_HEIGHT = 4;
  const BOTTOM_HELP_TEXT_HEIGHT = 1;
  const RESTART_PROMPT_HEIGHT = restartProps?.show ? 1 : 0;

  const currentAvailableHeight = (availableTerminalHeight ?? 40) - 2; // Subtract borders

  const fixedHeight =
    DIALOG_PADDING +
    TITLE_HEIGHT +
    SEARCH_BAR_HEIGHT +
    SCROLL_ARROWS_HEIGHT +
    SPACING_HEIGHT +
    BOTTOM_HELP_TEXT_HEIGHT +
    RESTART_PROMPT_HEIGHT;

  let showScopeSelection = true;
  let availableHeightForItems = Math.max(
    1,
    currentAvailableHeight - (fixedHeight + SCOPE_SELECTION_HEIGHT),
  );

  if (availableHeightForItems < 6 && availableTerminalHeight !== undefined) {
    // If items are too cramped, hide scope selection to prioritize the list
    showScopeSelection = false;
    availableHeightForItems = Math.max(1, currentAvailableHeight - fixedHeight);
  }

  // standard item height is roughly 3 lines (label + description + spacer)
  const maxVisibleItems = Math.max(1, Math.floor(availableHeightForItems / 3));
  const effectiveMaxItems = availableTerminalHeight
    ? Math.min(maxVisibleItems, items.length)
    : MAX_ITEMS_TO_SHOW_DEFAULT;

  const visibleItems = items.slice(
    scrollOffset,
    scrollOffset + effectiveMaxItems,
  );
  const showScrollUp = items.length > effectiveMaxItems;
  const showScrollDown = items.length > effectiveMaxItems;

  useKeypress(
    (key: Key) => {
      if (isEditing) return;

      if (key.name === 'tab' && showScopeSelection) {
        setFocusSection((prev) => (prev === 'items' ? 'scope' : 'items'));
        return;
      }

      if (focusSection === 'items') {
        if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
          const newIndex =
            activeItemIndex > 0 ? activeItemIndex - 1 : items.length - 1;
          setActiveItemIndex(newIndex);
          if (newIndex === items.length - 1) {
            setScrollOffset(Math.max(0, items.length - effectiveMaxItems));
          } else if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
        } else if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
          const newIndex =
            activeItemIndex < items.length - 1 ? activeItemIndex + 1 : 0;
          setActiveItemIndex(newIndex);
          if (newIndex === 0) {
            setScrollOffset(0);
          } else if (newIndex >= scrollOffset + effectiveMaxItems) {
            setScrollOffset(newIndex - effectiveMaxItems + 1);
          }
        } else if (keyMatchers[Command.RETURN](key)) {
          if (items[activeItemIndex]) {
            onItemAction(items[activeItemIndex]);
          }
        } else if (
          keyMatchers[Command.CLEAR_INPUT](key) ||
          keyMatchers[Command.CLEAR_SCREEN](key)
        ) {
          if (items[activeItemIndex] && onItemReset) {
            onItemReset(items[activeItemIndex]);
          }
        }
      }

      if (restartProps?.show && key.name === 'r') {
        restartProps.onRestart();
      }

      if (keyMatchers[Command.ESCAPE](key)) {
        onClose(selectedScope);
      }
    },
    { isActive: true },
  );

  const scopeItems = getScopeItems().map(
    (item: { label: string; value: LoadableSettingScope }) => ({
      ...item,
      key: item.value,
    }),
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
      height="100%"
    >
      <Box marginX={1}>
        <Text bold={focusSection === 'items' && !isEditing}>
          {focusSection === 'items' ? '> ' : '  '}
          {title}
        </Text>
      </Box>

      {enableSearch && (
        <Box
          borderStyle="round"
          borderColor={
            isEditing
              ? theme.border.default
              : focusSection === 'items'
                ? theme.border.focused
                : theme.border.default
          }
          paddingX={1}
          height={3}
          marginTop={1}
        >
          <TextInput
            focus={focusSection === 'items' && !isEditing}
            buffer={searchBuffer}
            placeholder="Search to filter"
          />
        </Box>
      )}

      <Box height={1} />

      {visibleItems.length === 0 ? (
        <Box marginX={1} height={1}>
          <Text color={theme.text.secondary}>No matches found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {showScrollUp && (
            <Box marginX={1}>
              <Text color={theme.text.secondary}>▲</Text>
            </Box>
          )}
          {visibleItems.map((item, idx) =>
            renderItem(
              item,
              focusSection === 'items' &&
                activeItemIndex === idx + scrollOffset,
              scrollOffset,
            ),
          )}
          {showScrollDown && (
            <Box marginX={1}>
              <Text color={theme.text.secondary}>▼</Text>
            </Box>
          )}
        </Box>
      )}

      <Box height={1} />

      {showScopeSelection && (
        <Box marginX={1} flexDirection="column">
          <Text bold={focusSection === 'scope'}>
            {focusSection === 'scope' ? '> ' : '  '}Apply To
          </Text>
          <RadioButtonSelect
            items={scopeItems}
            initialIndex={scopeItems.findIndex(
              (i: { value: LoadableSettingScope }) => i.value === selectedScope,
            )}
            onSelect={(scope) => {
              onScopeChange(scope);
              setFocusSection('items');
            }}
            isFocused={focusSection === 'scope'}
            showNumbers={focusSection === 'scope'}
          />
        </Box>
      )}

      <DialogFooter
        action={title.toLowerCase().includes('agent') ? 'edit' : 'select'}
        showTabInstruction={showScopeSelection}
        saveOnClose={title.toLowerCase().includes('agent')}
      />

      {restartProps?.show && (
        <Box marginX={1}>
          <Text color={theme.status.warning}>
            To see changes, Gemini CLI must be restarted. Press r to exit and
            apply changes now.
          </Text>
        </Box>
      )}
    </Box>
  );
}
