/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Static } from 'ink';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useAppContext } from '../contexts/AppContext.js';
import { AppHeader } from './AppHeader.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import {
  SCROLL_TO_ITEM_END,
  type VirtualizedListRef,
} from './shared/VirtualizedList.js';
import { ScrollableList } from './shared/ScrollableList.js';
import { useMemo, memo, useCallback, useEffect, useRef } from 'react';
import { MAX_GEMINI_MESSAGE_LINES } from '../constants.js';
import { useConfirmingTool } from '../hooks/useConfirmingTool.js';
import { ToolConfirmationQueue } from './ToolConfirmationQueue.js';
import { TaskTree } from './TaskTree.js';
import { useTaskTree } from '../hooks/useTaskTree.js';
import type { IndividualToolCallDisplay } from '../types.js';

const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
const MemoizedAppHeader = memo(AppHeader);

// Limit Gemini messages to a very high number of lines to mitigate performance
// issues in the worst case if we somehow get an enormous response from Gemini.
// This threshold is arbitrary but should be high enough to never impact normal
// usage.
export const MainContent = () => {
  const { version } = useAppContext();
  const uiState = useUIState();
  const isAlternateBuffer = useAlternateBuffer();

  const confirmingTool = useConfirmingTool();
  const showConfirmationQueue = confirmingTool !== null;
  const confirmingToolCallId = confirmingTool?.tool.callId;

  // Accumulate all tool calls for the current agent turn so the tree persists
  // across round-trips
  const lastUserPromptIndex = useMemo(() => {
    for (let i = uiState.history.length - 1; i >= 0; i--) {
      const type = uiState.history[i].type;
      if (type === 'user' || type === 'user_shell') {
        return i;
      }
    }
    return -1;
  }, [uiState.history]);

  const allCurrentTurnToolCalls = useMemo<IndividualToolCallDisplay[]>(() => {
    const calls: IndividualToolCallDisplay[] = [];
    // Completed batches already committed to history for this turn
    for (let i = lastUserPromptIndex + 1; i < uiState.history.length; i++) {
      const item = uiState.history[i];
      if (item.type === 'tool_group') {
        calls.push(...item.tools);
      }
    }
    // Live batch still pending
    for (const item of uiState.pendingHistoryItems) {
      if (item.type === 'tool_group') {
        calls.push(...item.tools);
      }
    }
    return calls;
  }, [uiState.history, uiState.pendingHistoryItems, lastUserPromptIndex]);

  const taskTree = useTaskTree(allCurrentTurnToolCalls);

  const scrollableListRef = useRef<VirtualizedListRef<unknown>>(null);

  useEffect(() => {
    if (showConfirmationQueue) {
      scrollableListRef.current?.scrollToEnd();
    }
  }, [showConfirmationQueue, confirmingToolCallId]);

  const { mainAreaWidth, staticAreaMaxItemHeight, cleanUiDetailsVisible } =
    uiState;
  const showHeaderDetails = cleanUiDetailsVisible;

  const augmentedHistory = useMemo(
    () =>
      uiState.history.map((item, index) => {
        const isExpandable = index > lastUserPromptIndex;
        const prevType =
          index > 0 ? uiState.history[index - 1]?.type : undefined;
        const isFirstThinking =
          item.type === 'thinking' && prevType !== 'thinking';
        const isFirstAfterThinking =
          item.type !== 'thinking' && prevType === 'thinking';
        // Suppress all tool_group items from the current turn when the task tree
        // is active — the tree is the single source of truth for the full turn.
        const suppressToolGroup =
          item.type === 'tool_group' &&
          index > lastUserPromptIndex &&
          taskTree.hasHierarchy;

        return {
          item,
          isExpandable,
          isFirstThinking,
          isFirstAfterThinking,
          suppressToolGroup,
        };
      }),
    [uiState.history, lastUserPromptIndex, taskTree.hasHierarchy],
  );

  const historyItems = useMemo(
    () =>
      augmentedHistory.map(
        ({
          item,
          isExpandable,
          isFirstThinking,
          isFirstAfterThinking,
          suppressToolGroup,
        }) => (
          <MemoizedHistoryItemDisplay
            terminalWidth={mainAreaWidth}
            availableTerminalHeight={
              uiState.constrainHeight || !isExpandable
                ? staticAreaMaxItemHeight
                : undefined
            }
            availableTerminalHeightGemini={MAX_GEMINI_MESSAGE_LINES}
            key={item.id}
            item={item}
            isPending={false}
            commands={uiState.slashCommands}
            isExpandable={isExpandable}
            isFirstThinking={isFirstThinking}
            isFirstAfterThinking={isFirstAfterThinking}
            suppressToolGroup={suppressToolGroup}
          />
        ),
      ),
    [
      augmentedHistory,
      mainAreaWidth,
      staticAreaMaxItemHeight,
      uiState.slashCommands,
      uiState.constrainHeight,
    ],
  );

  const staticHistoryItems = useMemo(
    () => historyItems.slice(0, lastUserPromptIndex + 1),
    [historyItems, lastUserPromptIndex],
  );

  const lastResponseHistoryItems = useMemo(
    () => historyItems.slice(lastUserPromptIndex + 1),
    [historyItems, lastUserPromptIndex],
  );

  const pendingItems = useMemo(
    () => (
      <Box flexDirection="column">
        {/* display task tree */}
        {taskTree.hasHierarchy && (
          <TaskTree
            {...taskTree}
            terminalWidth={mainAreaWidth}
            isFocused={!uiState.embeddedShellFocused}
          />
        )}
        {showConfirmationQueue && confirmingTool && (
          <ToolConfirmationQueue confirmingTool={confirmingTool} />
        )}
      </Box>
    ),
    [
      uiState.embeddedShellFocused,
      mainAreaWidth,
      showConfirmationQueue,
      confirmingTool,
      taskTree,
    ],
  );

  const virtualizedData = useMemo(
    () => [
      { type: 'header' as const },
      ...augmentedHistory.map(
        ({
          item,
          isExpandable,
          isFirstThinking,
          isFirstAfterThinking,
          suppressToolGroup,
        }) => ({
          type: 'history' as const,
          item,
          isExpandable,
          isFirstThinking,
          isFirstAfterThinking,
          suppressToolGroup,
        }),
      ),
      { type: 'pending' as const },
    ],
    [augmentedHistory],
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof virtualizedData)[number] }) => {
      if (item.type === 'header') {
        return (
          <MemoizedAppHeader
            key="app-header"
            version={version}
            showDetails={showHeaderDetails}
          />
        );
      } else if (item.type === 'history') {
        return (
          <MemoizedHistoryItemDisplay
            terminalWidth={mainAreaWidth}
            availableTerminalHeight={
              uiState.constrainHeight || !item.isExpandable
                ? staticAreaMaxItemHeight
                : undefined
            }
            availableTerminalHeightGemini={MAX_GEMINI_MESSAGE_LINES}
            key={item.item.id}
            item={item.item}
            isPending={false}
            commands={uiState.slashCommands}
            isExpandable={item.isExpandable}
            isFirstThinking={item.isFirstThinking}
            isFirstAfterThinking={item.isFirstAfterThinking}
            suppressToolGroup={item.suppressToolGroup}
          />
        );
      } else {
        return pendingItems;
      }
    },
    [
      showHeaderDetails,
      version,
      mainAreaWidth,
      uiState.slashCommands,
      pendingItems,
      uiState.constrainHeight,
      staticAreaMaxItemHeight,
    ],
  );

  if (isAlternateBuffer) {
    return (
      <ScrollableList
        ref={scrollableListRef}
        hasFocus={!uiState.isEditorDialogOpen && !uiState.embeddedShellFocused}
        width={uiState.terminalWidth}
        data={virtualizedData}
        renderItem={renderItem}
        estimatedItemHeight={() => 100}
        keyExtractor={(item, _index) => {
          if (item.type === 'header') return 'header';
          if (item.type === 'history') return item.item.id.toString();
          return 'pending';
        }}
        initialScrollIndex={SCROLL_TO_ITEM_END}
        initialScrollOffsetInIndex={SCROLL_TO_ITEM_END}
      />
    );
  }

  return (
    <>
      <Static
        key={uiState.historyRemountKey}
        items={[
          <AppHeader key="app-header" version={version} />,
          ...staticHistoryItems,
          ...lastResponseHistoryItems,
        ]}
      >
        {(item) => item}
      </Static>
      {pendingItems}
    </>
  );
};
