/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Static } from 'ink';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useAppContext } from '../contexts/AppContext.js';
import { AppHeader } from './AppHeader.js';

import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { useConfig } from '../contexts/ConfigContext.js';
import {
  SCROLL_TO_ITEM_END,
  type VirtualizedListRef,
} from './shared/VirtualizedList.js';
import { ScrollableList } from './shared/ScrollableList.js';
import { useMemo, memo, useCallback, useEffect, useRef } from 'react';
import { MAX_GEMINI_MESSAGE_LINES } from '../constants.js';
import { useConfirmingTool } from '../hooks/useConfirmingTool.js';
import { ToolConfirmationQueue } from './ToolConfirmationQueue.js';
import { isTopicTool } from './messages/TopicMessage.js';
import { appEvents, AppEvent } from '../../utils/events.js';

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
  const config = useConfig();
  const useTerminalBuffer =
    typeof config.getUseTerminalBuffer === 'function'
      ? config.getUseTerminalBuffer()
      : false;

  const confirmingTool = useConfirmingTool();
  const showConfirmationQueue = confirmingTool !== null;
  const confirmingToolCallId = confirmingTool?.tool.callId;

  const scrollableListRef = useRef<VirtualizedListRef<unknown>>(null);

  useEffect(() => {
    if (showConfirmationQueue) {
      scrollableListRef.current?.scrollToEnd();
    }
  }, [showConfirmationQueue, confirmingToolCallId]);

  useEffect(() => {
    const handleScroll = () => {
      scrollableListRef.current?.scrollToEnd();
    };
    appEvents.on(AppEvent.ScrollToBottom, handleScroll);
    return () => {
      appEvents.off(AppEvent.ScrollToBottom, handleScroll);
    };
  }, []);

  const {
    pendingHistoryItems,
    mainAreaWidth,
    staticAreaMaxItemHeight,
    availableTerminalHeight,
    cleanUiDetailsVisible,
    mouseMode,
  } = uiState;
  const showHeaderDetails = cleanUiDetailsVisible;

  const lastUserPromptIndex = useMemo(() => {
    for (let i = uiState.history.length - 1; i >= 0; i--) {
      const type = uiState.history[i].type;
      if (type === 'user' || type === 'user_shell') {
        return i;
      }
    }
    return -1;
  }, [uiState.history]);

  const settings = useSettings();
  const topicUpdateNarrationEnabled =
    settings.merged.experimental?.topicUpdateNarration === true;

  const suppressNarrationFlags = useMemo(() => {
    const combinedHistory = [...uiState.history, ...pendingHistoryItems];
    const flags = new Array<boolean>(combinedHistory.length).fill(false);

    if (topicUpdateNarrationEnabled) {
      let toolGroupInTurn = false;
      for (let i = combinedHistory.length - 1; i >= 0; i--) {
        const item = combinedHistory[i];
        if (item.type === 'user' || item.type === 'user_shell') {
          toolGroupInTurn = false;
        } else if (item.type === 'tool_group') {
          toolGroupInTurn = item.tools.some((t) => isTopicTool(t.name));
        } else if (
          (item.type === 'thinking' ||
            item.type === 'gemini' ||
            item.type === 'gemini_content') &&
          toolGroupInTurn
        ) {
          flags[i] = true;
        }
      }
    }
    return flags;
  }, [uiState.history, pendingHistoryItems, topicUpdateNarrationEnabled]);

  const augmentedHistory = useMemo(
    () =>
      uiState.history.map((item, i) => {
        const prevType = i > 0 ? uiState.history[i - 1]?.type : undefined;
        const isFirstThinking =
          item.type === 'thinking' && prevType !== 'thinking';
        const isFirstAfterThinking =
          item.type !== 'thinking' && prevType === 'thinking';

        return {
          item,
          isExpandable: i > lastUserPromptIndex,
          isFirstThinking,
          isFirstAfterThinking,
          suppressNarration: suppressNarrationFlags[i] ?? false,
        };
      }),
    [uiState.history, lastUserPromptIndex, suppressNarrationFlags],
  );

  const historyItems = useMemo(
    () =>
      augmentedHistory.map(
        ({
          item,
          isExpandable,
          isFirstThinking,
          isFirstAfterThinking,
          suppressNarration,
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
            suppressNarration={suppressNarration}
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
      <Box flexDirection="column" key="pending-items-group">
        {pendingHistoryItems.map((item, i) => {
          const prevType =
            i === 0
              ? uiState.history.at(-1)?.type
              : pendingHistoryItems[i - 1]?.type;
          const isFirstThinking =
            item.type === 'thinking' && prevType !== 'thinking';
          const isFirstAfterThinking =
            item.type !== 'thinking' && prevType === 'thinking';

          const suppressNarration =
            suppressNarrationFlags[uiState.history.length + i] ?? false;

          return (
            <HistoryItemDisplay
              key={`pending-${i}`}
              availableTerminalHeight={
                uiState.constrainHeight ? availableTerminalHeight : undefined
              }
              terminalWidth={mainAreaWidth}
              item={{ ...item, id: -(i + 1) }}
              isPending={true}
              isExpandable={true}
              isFirstThinking={isFirstThinking}
              isFirstAfterThinking={isFirstAfterThinking}
              suppressNarration={suppressNarration}
            />
          );
        })}
        {showConfirmationQueue && confirmingTool && (
          <ToolConfirmationQueue
            key="confirmation-queue"
            confirmingTool={confirmingTool}
          />
        )}
      </Box>
    ),
    [
      pendingHistoryItems,
      uiState.constrainHeight,
      availableTerminalHeight,
      mainAreaWidth,
      showConfirmationQueue,
      confirmingTool,
      uiState.history,
      suppressNarrationFlags,
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
          suppressNarration,
        }) => ({
          type: 'history' as const,
          item,
          isExpandable,
          isFirstThinking,
          isFirstAfterThinking,
          suppressNarration,
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
            suppressNarration={item.suppressNarration}
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

  const estimatedItemHeight = useCallback(() => 100, []);

  const keyExtractor = useCallback(
    (item: (typeof virtualizedData)[number], _index: number) => {
      if (item.type === 'header') return 'header';
      if (item.type === 'history') return item.item.id.toString();
      return 'pending';
    },
    [],
  );

  const isStaticItem = useCallback(
    (item: (typeof virtualizedData)[number]) => item.type !== 'pending',
    [],
  );

  const scrollableList = useMemo(() => {
    if (isAlternateBuffer) {
      return (
        <ScrollableList
          ref={scrollableListRef}
          hasFocus={
            !uiState.isEditorDialogOpen && !uiState.embeddedShellFocused
          }
          width={uiState.terminalWidth}
          data={virtualizedData}
          renderItem={renderItem}
          estimatedItemHeight={estimatedItemHeight}
          keyExtractor={keyExtractor}
          initialScrollIndex={SCROLL_TO_ITEM_END}
          initialScrollOffsetInIndex={SCROLL_TO_ITEM_END}
          renderStatic={useTerminalBuffer}
          isStaticItem={useTerminalBuffer ? isStaticItem : undefined}
          overflowToBackbuffer={useTerminalBuffer}
          scrollbar={mouseMode}
        />
        // TODO(jacobr): consider adding         stableScrollback={!config.getUseAlternateBuffer()}
        // but need to work out ensuring we only attempt it within a smaller range of scrollback vals.
      );
    }
    return null;
  }, [
    isAlternateBuffer,
    uiState.isEditorDialogOpen,
    uiState.embeddedShellFocused,
    uiState.terminalWidth,
    virtualizedData,
    renderItem,
    estimatedItemHeight,
    keyExtractor,
    useTerminalBuffer,
    isStaticItem,
    mouseMode,
  ]);

  if (isAlternateBuffer) {
    return scrollableList;
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
