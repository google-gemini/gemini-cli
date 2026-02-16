/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useMemo, useReducer, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useSettingsStore } from '../contexts/SettingsContext.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { TextInput } from './shared/TextInput.js';
import { useFuzzyList } from '../hooks/useFuzzyList.js';
import { FooterRow, type FooterRowItem } from './Footer.js';
import { ALL_ITEMS, resolveFooterState } from '../../config/footerItems.js';
import { SettingScope } from '../../config/settings.js';

interface FooterConfigDialogProps {
  onClose?: () => void;
}

interface FooterConfigState {
  orderedIds: string[];
  selectedIds: Set<string>;
  activeIndex: number;
  scrollOffset: number;
}

type FooterConfigAction =
  | { type: 'MOVE_UP'; filteredCount: number; maxToShow: number }
  | { type: 'MOVE_DOWN'; filteredCount: number; maxToShow: number }
  | {
      type: 'MOVE_LEFT';
      searchQuery: string;
      filteredItems: Array<{ key: string }>;
    }
  | {
      type: 'MOVE_RIGHT';
      searchQuery: string;
      filteredItems: Array<{ key: string }>;
    }
  | { type: 'TOGGLE_ITEM'; filteredItems: Array<{ key: string }> }
  | { type: 'SET_STATE'; payload: Partial<FooterConfigState> }
  | { type: 'RESET_INDEX' };

function footerConfigReducer(
  state: FooterConfigState,
  action: FooterConfigAction,
): FooterConfigState {
  switch (action.type) {
    case 'MOVE_UP': {
      const { filteredCount, maxToShow } = action;
      const totalSlots = filteredCount + 2; // +1 for showLabels, +1 for reset
      const newIndex =
        state.activeIndex > 0 ? state.activeIndex - 1 : totalSlots - 1;
      let newOffset = state.scrollOffset;

      if (newIndex < filteredCount) {
        if (newIndex === filteredCount - 1) {
          newOffset = Math.max(0, filteredCount - maxToShow);
        } else if (newIndex < state.scrollOffset) {
          newOffset = newIndex;
        }
      }
      return { ...state, activeIndex: newIndex, scrollOffset: newOffset };
    }
    case 'MOVE_DOWN': {
      const { filteredCount, maxToShow } = action;
      const totalSlots = filteredCount + 2;
      const newIndex =
        state.activeIndex < totalSlots - 1 ? state.activeIndex + 1 : 0;
      let newOffset = state.scrollOffset;

      if (newIndex === 0) {
        newOffset = 0;
      } else if (
        newIndex < filteredCount &&
        newIndex >= state.scrollOffset + maxToShow
      ) {
        newOffset = newIndex - maxToShow + 1;
      }
      return { ...state, activeIndex: newIndex, scrollOffset: newOffset };
    }
    case 'MOVE_LEFT':
    case 'MOVE_RIGHT': {
      if (action.searchQuery) return state;
      const direction = action.type === 'MOVE_LEFT' ? -1 : 1;
      const currentItem = action.filteredItems[state.activeIndex];
      if (!currentItem) return state;

      const currentId = currentItem.key;
      const currentIndex = state.orderedIds.indexOf(currentId);
      const newIndex = currentIndex + direction;

      if (newIndex < 0 || newIndex >= state.orderedIds.length) return state;

      const newOrderedIds = [...state.orderedIds];
      [newOrderedIds[currentIndex], newOrderedIds[newIndex]] = [
        newOrderedIds[newIndex],
        newOrderedIds[currentIndex],
      ];

      return { ...state, orderedIds: newOrderedIds, activeIndex: newIndex };
    }
    case 'TOGGLE_ITEM': {
      const isSystemFocused = state.activeIndex >= action.filteredItems.length;
      if (isSystemFocused) return state;

      const item = action.filteredItems[state.activeIndex];
      if (!item) return state;

      const nextSelected = new Set(state.selectedIds);
      if (nextSelected.has(item.key)) {
        nextSelected.delete(item.key);
      } else {
        nextSelected.add(item.key);
      }
      return { ...state, selectedIds: nextSelected };
    }
    case 'SET_STATE':
      return { ...state, ...action.payload };
    case 'RESET_INDEX':
      return { ...state, activeIndex: 0, scrollOffset: 0 };
    default:
      return state;
  }
}

export const FooterConfigDialog: React.FC<FooterConfigDialogProps> = ({
  onClose,
}) => {
  const { settings, setSetting } = useSettingsStore();
  const maxItemsToShow = 10;

  const [state, dispatch] = useReducer(footerConfigReducer, undefined, () => ({
    ...resolveFooterState(settings.merged),
    activeIndex: 0,
    scrollOffset: 0,
  }));

  const { orderedIds, selectedIds, activeIndex, scrollOffset } = state;

  // Prepare items for fuzzy list
  const listItems = useMemo(
    () =>
      orderedIds
        .map((id: string) => {
          const item = ALL_ITEMS.find((i) => i.id === id);
          if (!item) return null;
          return {
            key: id,
            label: id,
            description: item.description as string,
          };
        })
        .filter((i): i is NonNullable<typeof i> => i !== null),
    [orderedIds],
  );

  const { filteredItems, searchBuffer, searchQuery, maxLabelWidth } =
    useFuzzyList({
      items: listItems,
    });

  // Save settings when orderedIds or selectedIds change
  useEffect(() => {
    const finalItems = orderedIds.filter((id: string) => selectedIds.has(id));
    // Only save if it's different from current setting to avoid loops
    const currentSetting = settings.merged.ui?.footer?.items;
    if (JSON.stringify(finalItems) !== JSON.stringify(currentSetting)) {
      setSetting(SettingScope.User, 'ui.footer.items', finalItems);
    }
  }, [orderedIds, selectedIds, setSetting, settings.merged.ui?.footer?.items]);

  // Reset index when search changes
  useEffect(() => {
    dispatch({ type: 'RESET_INDEX' });
  }, [searchQuery]);

  const isResetFocused = activeIndex === filteredItems.length + 1;
  const isShowLabelsFocused = activeIndex === filteredItems.length;

  const handleResetToDefaults = useCallback(() => {
    setSetting(SettingScope.User, 'ui.footer.items', undefined);
    dispatch({
      type: 'SET_STATE',
      payload: {
        ...resolveFooterState(settings.merged),
        activeIndex: 0,
        scrollOffset: 0,
      },
    });
  }, [setSetting, settings.merged]);

  const handleToggleLabels = useCallback(() => {
    const current = settings.merged.ui.footer.showLabels !== false;
    setSetting(SettingScope.User, 'ui.footer.showLabels', !current);
  }, [setSetting, settings.merged.ui.footer.showLabels]);

  useKeypress(
    (key: Key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onClose?.();
        return true;
      }

      if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
        dispatch({
          type: 'MOVE_UP',
          filteredCount: filteredItems.length,
          maxToShow: maxItemsToShow,
        });
        return true;
      }

      if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
        dispatch({
          type: 'MOVE_DOWN',
          filteredCount: filteredItems.length,
          maxToShow: maxItemsToShow,
        });
        return true;
      }

      if (keyMatchers[Command.MOVE_LEFT](key)) {
        dispatch({ type: 'MOVE_LEFT', searchQuery, filteredItems });
        return true;
      }

      if (keyMatchers[Command.MOVE_RIGHT](key)) {
        dispatch({ type: 'MOVE_RIGHT', searchQuery, filteredItems });
        return true;
      }

      if (keyMatchers[Command.RETURN](key)) {
        if (isResetFocused) {
          handleResetToDefaults();
        } else if (isShowLabelsFocused) {
          handleToggleLabels();
        } else {
          dispatch({ type: 'TOGGLE_ITEM', filteredItems });
        }
        return true;
      }

      return false;
    },
    { isActive: true, priority: true },
  );

  const visibleItems = filteredItems.slice(
    scrollOffset,
    scrollOffset + maxItemsToShow,
  );

  const activeId = filteredItems[activeIndex]?.key;
  const showLabels = settings.merged.ui.footer.showLabels !== false;

  // Preview logic
  const previewContent = useMemo(() => {
    if (isResetFocused) {
      return (
        <Text color={theme.ui.comment} italic>
          Default footer (uses legacy settings)
        </Text>
      );
    }

    const itemsToPreview = orderedIds.filter((id: string) =>
      selectedIds.has(id),
    );
    if (itemsToPreview.length === 0) return null;

    const itemColor = showLabels ? theme.text.primary : theme.ui.comment;
    const getColor = (id: string, defaultColor?: string) =>
      id === activeId ? 'white' : defaultColor || itemColor;

    // Mock data for preview (headers come from ALL_ITEMS)
    const mockData: Record<string, React.ReactNode> = {
      cwd: <Text color={getColor('cwd', itemColor)}>~/project/path</Text>,
      'git-branch': <Text color={getColor('git-branch', itemColor)}>main</Text>,
      'sandbox-status': (
        <Text color={getColor('sandbox-status', 'green')}>docker</Text>
      ),
      'model-name': (
        <Text color={getColor('model-name', itemColor)}>gemini-2.5-pro</Text>
      ),
      'context-remaining': (
        <Text color={getColor('context-remaining', itemColor)}>85% left</Text>
      ),
      quota: <Text color={getColor('quota', itemColor)}>daily 97%</Text>,
      'memory-usage': (
        <Text color={getColor('memory-usage', itemColor)}>260 MB</Text>
      ),
      'session-id': (
        <Text color={getColor('session-id', itemColor)}>769992f9</Text>
      ),
      'code-changes': (
        <Box flexDirection="row">
          <Text color={getColor('code-changes', theme.status.success)}>
            +12
          </Text>
          <Text color={getColor('code-changes')}> </Text>
          <Text color={getColor('code-changes', theme.status.error)}>-4</Text>
        </Box>
      ),
      'token-count': (
        <Text color={getColor('token-count', itemColor)}>1.5k tokens</Text>
      ),
    };

    const rowItems: FooterRowItem[] = itemsToPreview
      .filter((id: string) => mockData[id])
      .map((id: string) => ({
        key: id,
        header: ALL_ITEMS.find((i) => i.id === id)?.header ?? id,
        element: mockData[id],
      }));

    return <FooterRow items={rowItems} showLabels={showLabels} />;
  }, [orderedIds, selectedIds, activeId, isResetFocused, showLabels]);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={2}
      paddingY={1}
      width="100%"
    >
      <Text bold>Configure Footer</Text>
      <Text color={theme.text.secondary}>
        Select which items to display in the footer.
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>Type to search</Text>
        <Box
          borderStyle="round"
          borderColor={theme.border.focused}
          paddingX={1}
          height={3}
        >
          {searchBuffer && <TextInput buffer={searchBuffer} focus={true} />}
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1} minHeight={maxItemsToShow}>
        {visibleItems.length === 0 ? (
          <Text color={theme.text.secondary}>No items found.</Text>
        ) : (
          visibleItems.map((item, idx) => {
            const index = scrollOffset + idx;
            const isFocused = index === activeIndex;
            const isChecked = selectedIds.has(item.key);

            return (
              <Box key={item.key} flexDirection="row">
                <Text color={isFocused ? theme.status.success : undefined}>
                  {isFocused ? '> ' : '  '}
                </Text>
                <Text
                  color={isFocused ? theme.status.success : theme.text.primary}
                >
                  [{isChecked ? '✓' : ' '}]{' '}
                  {item.label.padEnd(maxLabelWidth + 1)}
                </Text>
                <Text color={theme.text.secondary}> {item.description}</Text>
              </Box>
            );
          })
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box flexDirection="row">
          <Text color={isShowLabelsFocused ? theme.status.success : undefined}>
            {isShowLabelsFocused ? '> ' : '  '}
          </Text>
          <Text color={isShowLabelsFocused ? theme.status.success : undefined}>
            [{showLabels ? '✓' : ' '}] Show footer labels
          </Text>
        </Box>
        <Box flexDirection="row">
          <Text color={isResetFocused ? theme.status.warning : undefined}>
            {isResetFocused ? '> ' : '  '}
          </Text>
          <Text
            color={isResetFocused ? theme.status.warning : theme.text.secondary}
          >
            Reset to default footer
          </Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>
          ↑/↓ navigate · ←/→ reorder · enter select · esc close
        </Text>
        {searchQuery && (
          <Text color={theme.status.warning}>
            Reordering is disabled when searching.
          </Text>
        )}
      </Box>

      <Box
        marginTop={1}
        borderStyle="single"
        borderColor={theme.border.default}
        paddingX={1}
        flexDirection="column"
      >
        <Text bold>Preview:</Text>
        <Box flexDirection="row">{previewContent}</Box>
      </Box>
    </Box>
  );
};
