/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useMemo, useEffect, useCallback, useReducer } from 'react';
import { Box, Text } from 'ink';
import { AsyncFzf, type FzfResultItem } from 'fzf';
import { PolicyDecision, type PolicyRule } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { useSearchBuffer } from '../hooks/useSearchBuffer.js';
import { TextInput } from './shared/TextInput.js';
import { TabHeader, type Tab } from './shared/TabHeader.js';
import { Command } from '../key/keyMatchers.js';
import { useKeyMatchers } from '../hooks/useKeyMatchers.js';
import {
  buildPolicyListItems,
  type PolicyListItem,
} from '../utils/policyUtils.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';

const ITEM_HEIGHT = 2;

interface NavigationState {
  activeTabIndex: number;
  activeIndex: number;
  scrollOffset: number;
}

type NavigationAction =
  | { type: 'MOVE_UP'; maxItemsToShow: number }
  | { type: 'MOVE_DOWN'; maxItemsToShow: number; totalItems: number }
  | { type: 'CYCLE_TAB'; direction: number; numTabs: number }
  | { type: 'RESET_SCROLL' };

function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'MOVE_UP': {
      if (state.activeIndex <= 0) return state;
      const nextIndex = state.activeIndex - 1;
      return {
        ...state,
        activeIndex: nextIndex,
        scrollOffset:
          nextIndex < state.scrollOffset ? nextIndex : state.scrollOffset,
      };
    }
    case 'MOVE_DOWN': {
      if (state.activeIndex >= action.totalItems - 1) return state;
      const nextIndex = state.activeIndex + 1;
      return {
        ...state,
        activeIndex: nextIndex,
        scrollOffset:
          nextIndex >= state.scrollOffset + action.maxItemsToShow
            ? nextIndex - action.maxItemsToShow + 1
            : state.scrollOffset,
      };
    }
    case 'CYCLE_TAB': {
      return {
        ...state,
        activeTabIndex:
          (state.activeTabIndex + action.direction + action.numTabs) %
          action.numTabs,
        activeIndex: 0,
        scrollOffset: 0,
      };
    }
    case 'RESET_SCROLL': {
      return {
        ...state,
        activeIndex: 0,
        scrollOffset: 0,
      };
    }
    default:
      return state;
  }
}

interface PoliciesDialogProps {
  rules: readonly PolicyRule[];
  toolDisplayNames: Map<string, string>;
  onClose: () => void;
}

const TABS = [
  {
    decision: PolicyDecision.ALLOW,
    label: 'Allow',
    description: 'Tools that run automatically without confirmation.',
  },
  {
    decision: PolicyDecision.ASK_USER,
    label: 'Ask',
    description: 'Tools that require your approval before running.',
  },
  {
    decision: PolicyDecision.DENY,
    label: 'Deny',
    description: 'Tools that are blocked from running.',
  },
] as const;

export function PoliciesDialog({
  rules,
  toolDisplayNames,
  onClose,
}: PoliciesDialogProps): React.JSX.Element {
  const keyMatchers = useKeyMatchers();
  const { terminalHeight, terminalWidth, staticExtraHeight, constrainHeight } =
    useUIState();

  const [{ activeTabIndex, activeIndex, scrollOffset }, dispatch] = useReducer(
    navigationReducer,
    { activeTabIndex: 0, activeIndex: 0, scrollOffset: 0 },
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredItems, setFilteredItems] = useState<PolicyListItem[] | null>(
    null,
  );

  const activeTab = TABS[activeTabIndex];

  // Compute available height independently of the dialog's own rendered height
  // to break the circular dependency (dialog height -> controlsHeight ->
  // availableTerminalHeight -> dialog height).
  const dialogAvailableHeight = constrainHeight
    ? terminalHeight - staticExtraHeight
    : undefined;

  const { effectiveMaxItemsToShow, showTabDescription, showHelpText } =
    useMemo(() => {
      if (!dialogAvailableHeight) {
        return {
          effectiveMaxItemsToShow: 8,
          showTabDescription: true,
          showHelpText: true,
        };
      }

      // On small terminals (< 20 lines), hide tab description and help text
      // to reclaim 2 lines for content.
      const tight = dialogAvailableHeight < 20;
      const showDesc = !tight;
      const showHelp = !tight;

      // Fixed layout lines (full):
      // 2 (border) + 2 (padding) + 1 (title/tabs) + 1 (tab description) +
      // 3 (search) + 1 (list margin) + 2 (arrows) + 1 (footer margin) +
      // 1 (count text) + 1 (help text) = 15
      // When hiding tab description and help text: 13
      let staticHeight = 13; // base without optional elements
      if (showDesc) staticHeight += 1;
      if (showHelp) staticHeight += 1;

      const availableForItems = dialogAvailableHeight - staticHeight;
      const maxItems = Math.max(1, Math.floor(availableForItems / ITEM_HEIGHT));

      return {
        effectiveMaxItemsToShow: maxItems,
        showTabDescription: showDesc,
        showHelpText: showHelp,
      };
    }, [dialogAvailableHeight]);

  // Build items for all tabs
  const itemsByDecision = useMemo(() => {
    const map = new Map<PolicyDecision, PolicyListItem[]>();
    for (const tab of TABS) {
      map.set(
        tab.decision,
        buildPolicyListItems(rules, toolDisplayNames, tab.decision),
      );
    }
    return map;
  }, [rules, toolDisplayNames]);

  // Build tab headers with optional counts
  const showTabCounts = !isNarrowWidth(terminalWidth);
  const policyTabs: Tab[] = useMemo(
    () =>
      TABS.map((tab) => {
        const count = itemsByDecision.get(tab.decision)?.length ?? 0;
        return {
          key: tab.decision,
          header: showTabCounts ? `${tab.label} (${count})` : tab.label,
        };
      }),
    [itemsByDecision, showTabCounts],
  );

  // Get total count for current tab (unfiltered)
  const allTabItems = itemsByDecision.get(activeTab.decision) ?? [];

  // Build fzf instance per tab
  const fzfInstances = useMemo(() => {
    const map = new Map<PolicyDecision, AsyncFzf<PolicyListItem[]>>();
    for (const tab of TABS) {
      const items = itemsByDecision.get(tab.decision) ?? [];
      map.set(
        tab.decision,
        new AsyncFzf(items, {
          selector: (item: PolicyListItem) => item.searchText,
          fuzzy: 'v2',
          casing: 'case-insensitive',
        }),
      );
    }
    return map;
  }, [itemsByDecision]);

  // Perform search when query or tab changes
  useEffect(() => {
    let active = true;
    if (!searchQuery.trim()) {
      setFilteredItems(null);
      return;
    }

    const fzf = fzfInstances.get(activeTab.decision);
    if (!fzf) return;

    const doSearch = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const results = await fzf.find(searchQuery);
      if (!active) return;
      const matched: PolicyListItem[] = [];
      results.forEach((r: FzfResultItem<PolicyListItem>) => {
        matched.push(r.item);
      });
      setFilteredItems(matched);
    };

    void doSearch();
    return () => {
      active = false;
    };
  }, [searchQuery, activeTab.decision, fzfInstances]);

  // Items to display (filtered or all)
  const displayItems = filteredItems ?? allTabItems;

  // Reset scroll when filtered items change
  useEffect(() => {
    dispatch({ type: 'RESET_SCROLL' });
  }, [filteredItems]);

  // Search buffer
  const searchBuffer = useSearchBuffer({
    initialText: '',
    onChange: useCallback((text: string) => {
      setSearchQuery(text);
    }, []),
  });

  // Visible items
  const visibleItems = displayItems.slice(
    scrollOffset,
    scrollOffset + effectiveMaxItemsToShow,
  );
  const hasOverflow = displayItems.length > effectiveMaxItemsToShow;

  // Fixed height for the list area to prevent layout jumpiness in alternate
  // buffer mode. Each item is ITEM_HEIGHT lines, plus 2 for scroll arrows.
  const listAreaHeight = effectiveMaxItemsToShow * ITEM_HEIGHT + 2;

  // Keyboard handling
  useKeypress(
    (key: Key) => {
      // Tab cycling with left/right arrows or Tab
      if (
        keyMatchers[Command.MOVE_LEFT](key) ||
        keyMatchers[Command.MOVE_RIGHT](key) ||
        key.name === 'tab'
      ) {
        const direction =
          keyMatchers[Command.MOVE_LEFT](key) ||
          (key.name === 'tab' && key.shift)
            ? -1
            : 1;
        dispatch({ type: 'CYCLE_TAB', direction, numTabs: TABS.length });
        return;
      }

      // Up/Down navigation (no wrap-around)
      if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
        dispatch({ type: 'MOVE_UP', maxItemsToShow: effectiveMaxItemsToShow });
        return;
      }
      if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
        dispatch({
          type: 'MOVE_DOWN',
          maxItemsToShow: effectiveMaxItemsToShow,
          totalItems: displayItems.length,
        });
        return;
      }

      // Escape - clear search first, then close
      if (keyMatchers[Command.ESCAPE](key)) {
        if (searchQuery) {
          searchBuffer.setText('');
        } else {
          onClose();
        }
        return;
      }

      // Don't intercept other key matchers
    },
    { isActive: true, priority: true },
  );

  // Tab label
  const tabLabel = activeTab.label.toLowerCase();
  const filteredCount = displayItems.length;
  const totalCount = allTabItems.length;
  const countText =
    filteredItems !== null
      ? `${filteredCount} of ${totalCount} ${activeTab.label} policies`
      : `${totalCount} ${activeTab.label} ${totalCount === 1 ? 'policy' : 'policies'}`;

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      {/* Title & Tabs */}
      <Box marginX={1} flexDirection="row">
        <Text bold>Policies: </Text>
        <TabHeader
          tabs={policyTabs}
          currentIndex={activeTabIndex}
          showStatusIcons={false}
        />
      </Box>

      {/* Tab description */}
      {showTabDescription && (
        <Box marginX={1}>
          <Text color={theme.text.secondary}>{activeTab.description}</Text>
        </Box>
      )}

      {/* Search box */}
      <Box
        borderStyle="round"
        borderColor={theme.ui.focus}
        paddingX={1}
        height={3}
      >
        <TextInput
          focus={true}
          buffer={searchBuffer}
          placeholder="Search to filter..."
        />
      </Box>

      {/* List — fixed height to prevent jumpiness in alternate buffer */}
      <Box flexDirection="column" marginTop={1} height={listAreaHeight}>
        <Box marginX={1}>
          <Text color={theme.text.secondary}>
            {hasOverflow && scrollOffset > 0 ? '▲' : ' '}
          </Text>
        </Box>
        {displayItems.length === 0 ? (
          <Box marginX={1} flexDirection="column">
            <Text color={theme.text.secondary}>
              {searchQuery ? 'No policies match.' : `No ${tabLabel} policies.`}
            </Text>
            {!searchQuery && (
              <Text wrap="wrap">
                Learn more:{' '}
                <Text color={theme.text.link}>
                  https://geminicli.com/docs/reference/policy-engine/
                </Text>
              </Text>
            )}
          </Box>
        ) : (
          visibleItems.map((item, idx) => {
            const globalIndex = idx + scrollOffset;
            const isActive = activeIndex === globalIndex;

            // Line 1: Display name with optional constraint
            // e.g. "Shell(git diff*)" or "all tools"
            const toolPart =
              item.toolDisplayName === 'all tools' ? (
                <Text color={theme.text.secondary}>all tools</Text>
              ) : (
                <Text>
                  {item.toolDisplayName}
                  {item.constraint !== undefined && (
                    <Text color={theme.text.secondary}>
                      ({item.constraint})
                    </Text>
                  )}
                </Text>
              );

            return (
              <Box
                key={item.key}
                marginX={1}
                flexDirection="row"
                alignItems="flex-start"
                backgroundColor={isActive ? theme.background.focus : undefined}
              >
                <Box minWidth={2} flexShrink={0}>
                  <Text
                    color={isActive ? theme.ui.focus : theme.text.secondary}
                  >
                    {isActive ? '●' : ''}
                  </Text>
                </Box>
                <Box flexDirection="column" minWidth={0}>
                  <Text
                    color={isActive ? theme.ui.focus : theme.text.primary}
                    wrap="truncate"
                  >
                    {toolPart}
                  </Text>
                  {item.source && (
                    <Text color={theme.text.secondary} wrap="truncate">
                      {item.source}
                    </Text>
                  )}
                </Box>
              </Box>
            );
          })
        )}
        <Box marginX={1} marginTop={0}>
          <Text color={theme.text.secondary}>
            {hasOverflow &&
            scrollOffset + effectiveMaxItemsToShow < displayItems.length
              ? '▼'
              : ' '}
          </Text>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginX={1} marginTop={1}>
        <Text color={theme.text.secondary}>{countText}</Text>
      </Box>
      {showHelpText && (
        <Box marginX={1}>
          <Text color={theme.text.secondary}>
            (Use ↑↓ to navigate, ←/→ or Tab to cycle, Esc to close)
          </Text>
        </Box>
      )}
    </Box>
  );
}
