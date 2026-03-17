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

  const scrollableListRef = useRef<VirtualizedListRef<unknown>>(null);

  useEffect(() => {
    if (showConfirmationQueue) {
      scrollableListRef.current?.scrollToEnd();
    }
  }, [showConfirmationQueue, confirmingToolCallId]);

  const {
    pendingHistoryItems,
    mainAreaWidth,
    staticAreaMaxItemHeight,
    cleanUiDetailsVisible,
    isForegroundShellFullscreen,
    terminalHeight,
    activePtyId,
  } = uiState;
  const showHeaderDetails = cleanUiDetailsVisible;

  const fullscreenHeight = Math.max(terminalHeight - FOOTER_RESERVED_HEIGHT, 5);

  const lastUserPromptIndex = useMemo(() => {
    for (let i = uiState.history.length - 1; i >= 0; i--) {
      const type = uiState.history[i].type;
      if (type === 'user' || type === 'user_shell') {
        return i;
      }
    }
    return -1;
  }, [uiState.history]);

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

        return {
          item,
          isExpandable,
          isFirstThinking,
          isFirstAfterThinking,
        };
      }),
    [uiState.history, lastUserPromptIndex],
  );

  const historyItems = useMemo(
    () =>
      augmentedHistory.map(
        ({ item, isExpandable, isFirstThinking, isFirstAfterThinking }) => (
          <MemoizedHistoryItemDisplay
            terminalWidth={mainAreaWidth}
            availableTerminalHeight={
              isForegroundShellFullscreen
                ? fullscreenHeight
                : uiState.constrainHeight || !isExpandable
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
            isFullscreen={isForegroundShellFullscreen}
          />
        ),
      ),
    [
      augmentedHistory,
      mainAreaWidth,
      staticAreaMaxItemHeight,
      uiState.slashCommands,
      uiState.constrainHeight,
      isForegroundShellFullscreen,
      fullscreenHeight,
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
        {pendingHistoryItems.map((item, i) => {
          const prevType =
            i === 0
              ? uiState.history.at(-1)?.type
              : pendingHistoryItems[i - 1]?.type;
          const isFirstThinking =
            item.type === 'thinking' && prevType !== 'thinking';
          const isFirstAfterThinking =
            item.type !== 'thinking' && prevType === 'thinking';

          return (
            <HistoryItemDisplay
              key={i}
              availableTerminalHeight={
                isForegroundShellFullscreen
                  ? fullscreenHeight
                  : uiState.constrainHeight
                    ? staticAreaMaxItemHeight
                    : undefined
              }
              terminalWidth={mainAreaWidth}
              item={{ ...item, id: 0 }}
              isPending={true}
              isExpandable={true}
              isFirstThinking={isFirstThinking}
              isFirstAfterThinking={isFirstAfterThinking}
              isFullscreen={isForegroundShellFullscreen}
            />
          );
        })}
        {showConfirmationQueue && confirmingTool && (
          <ToolConfirmationQueue confirmingTool={confirmingTool} />
        )}
      </Box>
    ),
    [
      pendingHistoryItems,
      uiState.constrainHeight,
      staticAreaMaxItemHeight,
      mainAreaWidth,
      showConfirmationQueue,
      confirmingTool,
      uiState.history,
      isForegroundShellFullscreen,
      fullscreenHeight,
    ],
  );

  const virtualizedData = useMemo(() => {
    if (isForegroundShellFullscreen && activePtyId) {
      // Find the item that contains the active PTY
      const historyItem = uiState.history.find(
        (h) =>
          h.type === 'tool_group' &&
          h.tools.some((t) => t.ptyId === activePtyId),
      );
      if (historyItem) {
        return [
          {
            type: 'history' as const,
            item: historyItem,
            isExpandable: true,
            isFirstThinking: false,
            isFirstAfterThinking: false,
          },
        ];
      }
      const pendingItem = pendingHistoryItems.find(
        (h) =>
          h.type === 'tool_group' &&
          h.tools.some((t) => t.ptyId === activePtyId),
      );
      if (pendingItem) {
        return [{ type: 'pending' as const }];
      }
    }

    return [
      { type: 'header' as const },
      ...augmentedHistory.map(
        ({ item, isExpandable, isFirstThinking, isFirstAfterThinking }) => ({
          type: 'history' as const,
          item,
          isExpandable,
          isFirstThinking,
          isFirstAfterThinking,
        }),
      ),
      { type: 'pending' as const },
    ];
  }, [
    augmentedHistory,
    isForegroundShellFullscreen,
    activePtyId,
    uiState.history,
    pendingHistoryItems,
  ]);

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
              isForegroundShellFullscreen
                ? fullscreenHeight
                : uiState.constrainHeight || !item.isExpandable
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
            isFullscreen={isForegroundShellFullscreen}
          />
        );
      } else {
        if (isForegroundShellFullscreen && activePtyId) {
          const pendingItem = pendingHistoryItems.find(
            (h) =>
              h.type === 'tool_group' &&
              h.tools.some((t) => t.ptyId === activePtyId),
          );
          if (pendingItem) {
            return (
              <Box flexDirection="column">
                <HistoryItemDisplay
                  key={0}
                  availableTerminalHeight={fullscreenHeight}
                  terminalWidth={mainAreaWidth}
                  item={{ ...pendingItem, id: 0 }}
                  isPending={true}
                  isExpandable={true}
                  isFirstThinking={false}
                  isFirstAfterThinking={false}
                  isFullscreen={true}
                />
              </Box>
            );
          }
        }
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
      isForegroundShellFullscreen,
      fullscreenHeight,
      activePtyId,
      pendingHistoryItems,
    ],
  );

  if (isForegroundShellFullscreen && activePtyId) {
    const historyItem = uiState.history.find(
      (h) =>
        h.type === 'tool_group' && h.tools.some((t) => t.ptyId === activePtyId),
    );
    if (historyItem) {
      return (
        <Box flexDirection="column" flexGrow={1} display="flex">
          <HistoryItemDisplay
            terminalWidth={mainAreaWidth}
            availableTerminalHeight={fullscreenHeight}
            key={historyItem.id}
            item={historyItem}
            isPending={false}
            commands={uiState.slashCommands}
            isExpandable={true}
            isFullscreen={true}
          />
        </Box>
      );
    }
    const pendingItem = pendingHistoryItems.find(
      (h) =>
        h.type === 'tool_group' && h.tools.some((t) => t.ptyId === activePtyId),
    );
    if (pendingItem) {
      return (
        <Box flexDirection="column" flexGrow={1} display="flex">
          <HistoryItemDisplay
            key={0}
            availableTerminalHeight={fullscreenHeight}
            terminalWidth={mainAreaWidth}
            item={{ ...pendingItem, id: 0 }}
            isPending={true}
            isExpandable={true}
            isFullscreen={true}
          />
        </Box>
      );
    }
  }

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
