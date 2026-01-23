/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { theme } from '../../semantic-colors.js';
import type { LoadableSettingScope } from '../../../config/settings.js';
import { getScopeItems } from '../../../utils/dialogScopeUtils.js';
import { RadioButtonSelect } from './RadioButtonSelect.js';
import { TextInput } from './TextInput.js';
import type { TextBuffer } from './text-buffer.js';
import { cpSlice, cpLen } from '../../utils/textUtils.js';

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
}

/**
 * Props for BaseSettingsDialog component.
 */
export interface BaseSettingsDialogProps {
  // Header
  /** Dialog title displayed at the top */
  title: string;

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
  /** Currently active/highlighted item index */
  activeIndex: number;

  // Edit mode state
  /** Key of the item currently being edited, or null if not editing */
  editingKey: string | null;
  /** Current edit buffer content */
  editBuffer: string;
  /** Cursor position within edit buffer */
  editCursorPos: number;
  /** Whether cursor is visible (for blinking effect) */
  cursorVisible: boolean;

  // Scope selector
  /** Whether to show the scope selector. Default: true */
  showScopeSelector?: boolean;
  /** Currently selected scope */
  selectedScope: LoadableSettingScope;
  /** Callback when scope is highlighted (hovered/navigated to) */
  onScopeHighlight?: (scope: LoadableSettingScope) => void;
  /** Callback when scope is selected (Enter pressed) */
  onScopeSelect?: (scope: LoadableSettingScope) => void;

  // Focus management
  /** Which section has focus: 'settings' or 'scope' */
  focusSection: 'settings' | 'scope';

  // Scroll
  /** Current scroll offset */
  scrollOffset: number;
  /** Maximum number of items to show at once */
  maxItemsToShow: number;

  // Layout
  /** Maximum label width for alignment */
  maxLabelWidth?: number;

  // Optional extra content below help text (for restart prompt, etc.)
  /** Optional footer content (e.g., restart prompt) */
  footerContent?: React.ReactNode;
}

/**
 * A base settings dialog component that handles rendering and layout.
 * Parent components handle business logic (saving, filtering, etc.).
 */
export function BaseSettingsDialog({
  title,
  searchEnabled = true,
  searchPlaceholder = 'Search to filter',
  searchBuffer,
  items,
  activeIndex,
  editingKey,
  editBuffer,
  editCursorPos,
  cursorVisible,
  showScopeSelector = true,
  selectedScope,
  onScopeHighlight,
  onScopeSelect,
  focusSection,
  scrollOffset,
  maxItemsToShow,
  maxLabelWidth,
  footerContent,
}: BaseSettingsDialogProps): React.JSX.Element {
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
              onSelect={onScopeSelect ?? (() => {})}
              onHighlight={onScopeHighlight}
              isFocused={focusSection === 'scope'}
              showNumbers={focusSection === 'scope'}
            />
          </Box>
        )}

        <Box height={1} />

        {/* Help text */}
        <Box marginX={1}>
          <Text color={theme.text.secondary}>
            (Use Enter to select
            {showScopeSelector ? ', Tab to change focus' : ''}, Esc to close)
          </Text>
        </Box>

        {/* Footer content (e.g., restart prompt) */}
        {footerContent && <Box marginX={1}>{footerContent}</Box>}
      </Box>
    </Box>
  );
}
