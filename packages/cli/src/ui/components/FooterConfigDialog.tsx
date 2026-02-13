/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useSettingsStore } from '../contexts/SettingsContext.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { TextInput } from './shared/TextInput.js';
import { useFuzzyList } from '../hooks/useFuzzyList.js';
import {
  ALL_ITEMS,
  DEFAULT_ORDER,
  deriveItemsFromLegacySettings,
} from '../../config/footerItems.js';
import { SettingScope } from '../../config/settings.js';

interface FooterConfigDialogProps {
  onClose?: () => void;
}

export const FooterConfigDialog: React.FC<FooterConfigDialogProps> = ({
  onClose,
}) => {
  const { settings, setSetting } = useSettingsStore();

  // Initialize orderedIds and selectedIds
  const [orderedIds, setOrderedIds] = useState<string[]>(() => {
    const validIds = new Set(ALL_ITEMS.map((i) => i.id));

    if (settings.merged.ui?.footer?.items) {
      // Start with saved items in their saved order
      const savedItems = settings.merged.ui.footer.items.filter((id) =>
        validIds.has(id),
      );
      // Then add any items from DEFAULT_ORDER that aren't in savedItems
      const others = DEFAULT_ORDER.filter((id) => !savedItems.includes(id));
      return [...savedItems, ...others];
    }
    // Fallback to legacy settings derivation
    const derived = deriveItemsFromLegacySettings(settings.merged).filter(
      (id) => validIds.has(id),
    );
    const others = DEFAULT_ORDER.filter((id) => !derived.includes(id));
    return [...derived, ...others];
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const validIds = new Set(ALL_ITEMS.map((i) => i.id));
    if (settings.merged.ui?.footer?.items) {
      return new Set(
        settings.merged.ui.footer.items.filter((id) => validIds.has(id)),
      );
    }
    return new Set(
      deriveItemsFromLegacySettings(settings.merged).filter((id) =>
        validIds.has(id),
      ),
    );
  });

  // Prepare items for fuzzy list
  const listItems = useMemo(
    () =>
      orderedIds
        .map((id) => {
          const item = ALL_ITEMS.find((i) => i.id === id);
          if (!item) return null;
          return {
            key: id,
            label: item.id,
            description: item.description,
          };
        })
        .filter((i): i is NonNullable<typeof i> => i !== null),
    [orderedIds],
  );

  const { filteredItems, searchBuffer, searchQuery, maxLabelWidth } =
    useFuzzyList({
      items: listItems,
    });

  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const maxItemsToShow = 10;

  // Reset index when search changes
  useEffect(() => {
    setActiveIndex(0);
    setScrollOffset(0);
  }, [searchQuery]);

  // The reset action lives one index past the filtered item list
  const isResetFocused = activeIndex === filteredItems.length;

  const handleResetToDefaults = useCallback(() => {
    // Clear the custom items setting so the legacy footer path is used
    setSetting(SettingScope.User, 'ui.footer.items', undefined);

    // Reset local state to reflect legacy-derived items
    const validIds = new Set(ALL_ITEMS.map((i) => i.id));
    const derived = deriveItemsFromLegacySettings(settings.merged).filter(
      (id) => validIds.has(id),
    );
    const others = DEFAULT_ORDER.filter((id) => !derived.includes(id));
    setOrderedIds([...derived, ...others]);
    setSelectedIds(new Set(derived));
    setActiveIndex(0);
    setScrollOffset(0);
  }, [setSetting, settings.merged]);

  const handleConfirm = useCallback(async () => {
    if (isResetFocused) {
      handleResetToDefaults();
      return;
    }

    const item = filteredItems[activeIndex];
    if (!item) return;

    const next = new Set(selectedIds);
    if (next.has(item.key)) {
      next.delete(item.key);
    } else {
      next.add(item.key);
    }
    setSelectedIds(next);

    // Save immediately on toggle
    const finalItems = orderedIds.filter((id) => next.has(id));
    setSetting(SettingScope.User, 'ui.footer.items', finalItems);
  }, [
    filteredItems,
    activeIndex,
    orderedIds,
    setSetting,
    selectedIds,
    isResetFocused,
    handleResetToDefaults,
  ]);

  const handleReorder = useCallback(
    (direction: number) => {
      if (searchQuery) return; // Reorder disabled when searching

      const currentItem = filteredItems[activeIndex];
      if (!currentItem) return;

      const currentId = currentItem.key;
      const currentIndex = orderedIds.indexOf(currentId);
      const newIndex = currentIndex + direction;

      if (newIndex < 0 || newIndex >= orderedIds.length) return;

      const newOrderedIds = [...orderedIds];
      [newOrderedIds[currentIndex], newOrderedIds[newIndex]] = [
        newOrderedIds[newIndex],
        newOrderedIds[currentIndex],
      ];
      setOrderedIds(newOrderedIds);
      setActiveIndex(newIndex);

      // Save immediately on reorder
      const finalItems = newOrderedIds.filter((id) => selectedIds.has(id));
      setSetting(SettingScope.User, 'ui.footer.items', finalItems);

      // Adjust scroll offset if needed
      if (newIndex < scrollOffset) {
        setScrollOffset(newIndex);
      } else if (newIndex >= scrollOffset + maxItemsToShow) {
        setScrollOffset(newIndex - maxItemsToShow + 1);
      }
    },
    [
      searchQuery,
      filteredItems,
      activeIndex,
      orderedIds,
      scrollOffset,
      maxItemsToShow,
      selectedIds,
      setSetting,
    ],
  );

  useKeypress(
    (key: Key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onClose?.();
        return true;
      }

      if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
        // Navigation wraps: items 0..filteredItems.length-1, then reset row at filteredItems.length
        const totalSlots = filteredItems.length + 1;
        const newIndex = activeIndex > 0 ? activeIndex - 1 : totalSlots - 1;
        setActiveIndex(newIndex);
        // Only adjust scroll when within the item list
        if (newIndex < filteredItems.length) {
          if (newIndex === filteredItems.length - 1) {
            setScrollOffset(Math.max(0, filteredItems.length - maxItemsToShow));
          } else if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
        }
        return true;
      }

      if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
        const totalSlots = filteredItems.length + 1;
        const newIndex = activeIndex < totalSlots - 1 ? activeIndex + 1 : 0;
        setActiveIndex(newIndex);
        if (newIndex === 0) {
          setScrollOffset(0);
        } else if (
          newIndex < filteredItems.length &&
          newIndex >= scrollOffset + maxItemsToShow
        ) {
          setScrollOffset(newIndex - maxItemsToShow + 1);
        }
        return true;
      }

      if (keyMatchers[Command.MOVE_LEFT](key)) {
        handleReorder(-1);
        return true;
      }

      if (keyMatchers[Command.MOVE_RIGHT](key)) {
        handleReorder(1);
        return true;
      }

      if (keyMatchers[Command.RETURN](key)) {
        void handleConfirm();
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

  // Preview logic
  const previewText = useMemo(() => {
    if (isResetFocused) {
      return (
        <Text color={theme.text.secondary} italic>
          Default footer (uses legacy settings)
        </Text>
      );
    }

    const itemsToPreview = orderedIds.filter((id) => selectedIds.has(id));
    if (itemsToPreview.length === 0) return null;

    const getColor = (id: string, defaultColor?: string) =>
      id === activeId ? 'white' : defaultColor || theme.text.secondary;

    // Mock values for preview
    const mockValues: Record<string, React.ReactNode> = {
      cwd: <Text color={getColor('cwd')}>~/project/path</Text>,
      'git-branch': <Text color={getColor('git-branch')}>main*</Text>,
      'sandbox-status': (
        <Text color={getColor('sandbox-status', 'green')}>docker</Text>
      ),
      'model-name': (
        <Box flexDirection="row">
          <Text color={getColor('model-name')}>gemini-2.5-pro</Text>
        </Box>
      ),
      'context-remaining': (
        <Text color={getColor('context-remaining')}>85% context left</Text>
      ),
      quota: <Text color={getColor('quota')}>daily 97%</Text>,
      'memory-usage': <Text color={getColor('memory-usage')}>124MB</Text>,
      'session-id': <Text color={getColor('session-id')}>769992f9</Text>,
      'code-changes': (
        <Box flexDirection="row">
          <Text color={getColor('code-changes', theme.status.success)}>
            +12
          </Text>
          <Text color={getColor('code-changes')}> </Text>
          <Text color={getColor('code-changes', theme.status.error)}>-4</Text>
        </Box>
      ),
      'token-count': <Text color={getColor('token-count')}>1.5k tokens</Text>,
    };

    const elements: React.ReactNode[] = [];
    itemsToPreview.forEach((id, idx) => {
      if (idx > 0) {
        elements.push(
          <Text key={`sep-${id}`} color={theme.text.secondary}>
            {' | '}
          </Text>,
        );
      }
      elements.push(<Box key={id}>{mockValues[id] || id}</Box>);
    });

    return elements;
  }, [orderedIds, selectedIds, activeId, isResetFocused]);

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

      <Box marginTop={1}>
        <Text
          color={isResetFocused ? theme.status.warning : theme.text.secondary}
        >
          {isResetFocused ? '> ' : '  '}
          Reset to default footer
        </Text>
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
        <Box flexDirection="row">{previewText}</Box>
      </Box>
    </Box>
  );
};
