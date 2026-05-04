/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useMemo, useReducer, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useSettingsStore } from '../contexts/SettingsContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { Command } from '../key/keyMatchers.js';
import { FooterRow, type FooterRowItem } from './Footer.js';
import {
  ALL_ITEMS,
  resolveFooterState,
  deriveItemsFromLegacySettings,
} from '../../config/footerItems.js';
import { SettingScope } from '../../config/settings.js';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import type { SelectionListItem } from '../hooks/useSelectionList.js';
import { DialogFooter } from './shared/DialogFooter.js';
import { useKeyMatchers } from '../hooks/useKeyMatchers.js';

interface FooterConfigDialogProps {
  onClose?: () => void;
}

interface FooterConfigItem {
  key: string;
  id: string;
  label: string;
  description?: string;
  type: 'config' | 'labels-toggle' | 'reset';
}

interface FooterConfigState {
  orderedIds: string[];
  selectedIds: Set<string>;
}

type FooterConfigAction =
  | { type: 'MOVE_ITEM'; id: string; direction: number }
  | { type: 'TOGGLE_ITEM'; id: string }
  | { type: 'SET_STATE'; payload: Partial<FooterConfigState> };

function footerConfigReducer(
  state: FooterConfigState,
  action: FooterConfigAction,
): FooterConfigState {
  switch (action.type) {
    case 'MOVE_ITEM': {
      const currentIndex = state.orderedIds.indexOf(action.id);
      const newIndex = currentIndex + action.direction;
      if (
        currentIndex === -1 ||
        newIndex < 0 ||
        newIndex >= state.orderedIds.length
      ) {
        return state;
      }
      const newOrderedIds = [...state.orderedIds];
      [newOrderedIds[currentIndex], newOrderedIds[newIndex]] = [
        newOrderedIds[newIndex],
        newOrderedIds[currentIndex],
      ];
      return { ...state, orderedIds: newOrderedIds };
    }
    case 'TOGGLE_ITEM': {
      const nextSelected = new Set(state.selectedIds);
      if (nextSelected.has(action.id)) {
        nextSelected.delete(action.id);
      } else {
        nextSelected.add(action.id);
      }
      return { ...state, selectedIds: nextSelected };
    }
    case 'SET_STATE':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

export const FooterConfigDialog: React.FC<FooterConfigDialogProps> = ({
  onClose,
}) => {
  const keyMatchers = useKeyMatchers();
  const { settings, setSetting } = useSettingsStore();
  const { constrainHeight, terminalHeight, staticExtraHeight } = useUIState();
  const [state, dispatch] = useReducer(footerConfigReducer, undefined, () =>
    resolveFooterState(settings.merged),
  );

  const { orderedIds, selectedIds } = state;
  const [focusKey, setFocusKey] = useState<string | undefined>(orderedIds[0]);

  const listItems = useMemo((): Array<SelectionListItem<FooterConfigItem>> => {
    const items: Array<SelectionListItem<FooterConfigItem>> = orderedIds
      .map((id: string) => {
        const item = ALL_ITEMS.find((i) => i.id === id);
        if (!item) return null;
        return {
          key: id,
          value: {
            key: id,
            id,
            label: item.id,
            description: item.description as string,
            type: 'config' as const,
          },
        };
      })
      .filter((i): i is NonNullable<typeof i> => i !== null);

    items.push({
      key: 'show-labels',
      value: {
        key: 'show-labels',
        id: 'show-labels',
        label: 'Show footer labels',
        type: 'labels-toggle',
      },
    });

    items.push({
      key: 'reset',
      value: {
        key: 'reset',
        id: 'reset',
        label: 'Reset to default footer',
        type: 'reset',
      },
    });

    return items;
  }, [orderedIds]);

  const handleSaveAndClose = useCallback(() => {
    const finalItems = orderedIds.filter((id: string) => selectedIds.has(id));
    const currentSetting = settings.merged.ui?.footer?.items;
    // When items haven't been explicitly set yet (legacy mode), compare against
    // the legacy-derived items to avoid persisting items and silently overriding
    // legacy boolean settings like hideContextPercentage.
    const effectiveCurrent =
      currentSetting ?? deriveItemsFromLegacySettings(settings.merged);
    if (JSON.stringify(finalItems) !== JSON.stringify(effectiveCurrent)) {
      setSetting(SettingScope.User, 'ui.footer.items', finalItems);
    }
    onClose?.();
  }, [orderedIds, selectedIds, setSetting, settings.merged, onClose]);

  const handleResetToDefaults = useCallback(() => {
    setSetting(SettingScope.User, 'ui.footer.items', undefined);
    const newState = resolveFooterState(settings.merged);
    dispatch({ type: 'SET_STATE', payload: newState });
    setFocusKey(newState.orderedIds[0]);
  }, [setSetting, settings.merged]);

  const handleToggleLabels = useCallback(() => {
    const current = settings.merged.ui.footer.showLabels !== false;
    setSetting(SettingScope.User, 'ui.footer.showLabels', !current);
  }, [setSetting, settings.merged.ui.footer.showLabels]);

  const handleSelect = useCallback(
    (item: FooterConfigItem) => {
      if (item.type === 'config') {
        dispatch({ type: 'TOGGLE_ITEM', id: item.id });
      } else if (item.type === 'labels-toggle') {
        handleToggleLabels();
      } else if (item.type === 'reset') {
        handleResetToDefaults();
      }
    },
    [handleResetToDefaults, handleToggleLabels],
  );

  const handleHighlight = useCallback((item: FooterConfigItem) => {
    setFocusKey(item.key);
  }, []);

  useKeypress(
    (key: Key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        handleSaveAndClose();
        return true;
      }

      if (keyMatchers[Command.MOVE_LEFT](key)) {
        if (focusKey && orderedIds.includes(focusKey)) {
          dispatch({ type: 'MOVE_ITEM', id: focusKey, direction: -1 });
          return true;
        }
      }

      if (keyMatchers[Command.MOVE_RIGHT](key)) {
        if (focusKey && orderedIds.includes(focusKey)) {
          dispatch({ type: 'MOVE_ITEM', id: focusKey, direction: 1 });
          return true;
        }
      }

      return false;
    },
    { isActive: true, priority: true },
  );

  const showLabels = settings.merged.ui.footer.showLabels !== false;

  // Preview logic
  const previewContent = useMemo(() => {
    if (focusKey === 'reset') {
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
      defaultColor || itemColor;

    // Mock data for preview (headers come from ALL_ITEMS)
    const mockData: Record<string, React.ReactNode> = {
      workspace: (
        <Text color={getColor('workspace', itemColor)}>~/project/path</Text>
      ),
      'git-branch': <Text color={getColor('git-branch', itemColor)}>main</Text>,
      sandbox: <Text color={getColor('sandbox', 'green')}>docker</Text>,
      'model-name': (
        <Text color={getColor('model-name', itemColor)}>gemini-2.5-pro</Text>
      ),
      'context-used': (
        <Text color={getColor('context-used', itemColor)}>85% used</Text>
      ),
      quota: <Text color={getColor('quota', itemColor)}>42% used</Text>,
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
      auth: <Text color={getColor('auth', itemColor)}>test@example.com</Text>,
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
        flexGrow: 0,
        isFocused: id === focusKey,
      }));

    return (
      <Box overflow="hidden" flexWrap="nowrap" width="100%">
        <FooterRow items={rowItems} showLabels={showLabels} />
      </Box>
    );
  }, [orderedIds, selectedIds, focusKey, showLabels]);

  const availableTerminalHeight = constrainHeight
    ? terminalHeight - staticExtraHeight
    : Number.MAX_SAFE_INTEGER;

  const BORDER_HEIGHT = 2; // Outer round border
  const STATIC_ELEMENTS = 13; // Text, margins, preview box, dialog footer

  // Default padding adds 2 lines (top and bottom)
  let includePadding = true;
  if (availableTerminalHeight < BORDER_HEIGHT + 2 + STATIC_ELEMENTS + 6) {
    includePadding = false;
  }

  const effectivePaddingY = includePadding ? 2 : 0;
  const availableListSpace = Math.max(
    0,
    availableTerminalHeight -
      BORDER_HEIGHT -
      effectivePaddingY -
      STATIC_ELEMENTS,
  );

  const maxItemsToShow = Math.max(
    1,
    Math.min(listItems.length, Math.floor(availableListSpace / 2)),
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={2}
      paddingY={includePadding ? 1 : 0}
      width="100%"
    >
      <Text bold>Configure Footer{'\n'}</Text>
      <Text color={theme.text.secondary}>
        Select which items to display in the footer.
      </Text>

      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        <BaseSelectionList<FooterConfigItem>
          items={listItems}
          onSelect={handleSelect}
          onHighlight={handleHighlight}
          focusKey={focusKey}
          showNumbers={false}
          maxItemsToShow={maxItemsToShow}
          showScrollArrows={true}
          selectedIndicator=">"
          renderItem={(item, { isSelected, titleColor }) => {
            const configItem = item.value;
            const isChecked =
              configItem.type === 'config'
                ? selectedIds.has(configItem.id)
                : configItem.type === 'labels-toggle'
                  ? showLabels
                  : false;

            return (
              <Box flexDirection="column" minHeight={2}>
                <Box flexDirection="row">
                  {configItem.type !== 'reset' && (
                    <Text
                      color={
                        isChecked ? theme.status.success : theme.text.secondary
                      }
                    >
                      [{isChecked ? '✓' : ' '}]
                    </Text>
                  )}
                  <Text
                    color={
                      configItem.type === 'reset' && isSelected
                        ? theme.status.warning
                        : titleColor
                    }
                  >
                    {configItem.type !== 'reset' ? ' ' : ''}
                    {configItem.label}
                  </Text>
                </Box>
                {configItem.description && (
                  <Text color={theme.text.secondary} wrap="wrap">
                    {' '}
                    {configItem.description}
                  </Text>
                )}
              </Box>
            );
          }}
        />
      </Box>

      <DialogFooter
        primaryAction="Enter to select"
        navigationActions="↑/↓ to navigate · ←/→ to reorder"
        cancelAction="Esc to close"
      />

      <Box
        marginTop={1}
        borderStyle="single"
        borderColor={theme.border.default}
        paddingX={1}
        flexDirection="column"
      >
        <Text bold>Preview:</Text>
        <Box flexDirection="row" width="100%">
          {previewContent}
        </Box>
      </Box>
    </Box>
  );
};
