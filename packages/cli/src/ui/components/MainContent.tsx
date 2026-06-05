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
import { Banner } from './Banner.js';
import { useBanner } from '../hooks/useBanner.js';

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
  const isAlternateBufferOrTerminalBuffer = useAlternateBuffer();
  const config = useConfig();
  const useTerminalBuffer = config.getUseTerminalBuffer();
  const isAlternateBuffer = config.getUseAlternateBuffer();

  const confirmingTool = useConfirmingTool();
  const showConfirmationQueue = confirmingTool !== null;
  const confirmingToolCallId = confirmingTool?.tool.callId;

  const { bannerText } = useBanner(uiState.bannerData);
  const showMigrationBanner =
    uiState.bannerVisible &&
    bannerText !== '' &&
    bannerText.includes('Antigravity');

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

  const augmentedHistory = useMemo(
    () =>
      uiState.history.flatMap((item, i) => {
        const prevType = i > 0 ? uiState.history[i - 1]?.type : undefined;
        const isFirstThinking =
          item.type === 'thinking' && prevType !== 'thinking';
        const isFirstAfterThinking =
          item.type !== 'thinking' && prevType === 'thinking';
        const isToolGroupBoundary =
          (item.type !== 'tool_group' && prevType === 'tool_group') ||
          (item.type === 'tool_group' && prevType !== 'tool_group');

        const mainEntry = {
          type: 'history' as const,
          item,
          isExpandable: i > lastUserPromptIndex,
          isFirstThinking,
          isFirstAfterThinking,
          isToolGroupBoundary,
        };

        const nextItem = uiState.history[i + 1];
        const isEndOfTurn =
          !nextItem ||
          nextItem.type === 'user' ||
          nextItem.type === 'user_shell';

        if (item.type === 'gemini' && isEndOfTurn && showMigrationBanner) {
          return [
            mainEntry,
            {
              type: 'banner' as const,
              id: `banner-after-${item.id}`,
            },
          ];
        }

        return [mainEntry];
      }),
    [uiState.history, lastUserPromptIndex, showMigrationBanner],
  );

  const historyItems = useMemo(
    () =>
      augmentedHistory.map((entry) => {
        if (entry.type === 'history') {
          const {
            item,
            isExpandable,
            isFirstThinking,
            isFirstAfterThinking,
            isToolGroupBoundary,
          } = entry;
          return (
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
              isToolGroupBoundary={isToolGroupBoundary}
            />
          );
        } else {
          return (
            <Banner
              key={entry.id}
              width={mainAreaWidth}
              bannerText={bannerText}
              isWarning={uiState.bannerData.warningText !== ''}
            />
          );
        }
      }),
    [
      augmentedHistory,
      mainAreaWidth,
      staticAreaMaxItemHeight,
      uiState.slashCommands,
      uiState.constrainHeight,
      bannerText,
      uiState.bannerData.warningText,
    ],
  );

  const lastUserPromptHistoryIndex = useMemo(() => {
    for (let i = augmentedHistory.length - 1; i >= 0; i--) {
      const entry = augmentedHistory[i];
      if (
        entry.type === 'history' &&
        (entry.item.type === 'user' || entry.item.type === 'user_shell')
      ) {
        return i;
      }
    }
    return -1;
  }, [augmentedHistory]);

  const staticHistoryItems = useMemo(
    () => historyItems.slice(0, lastUserPromptHistoryIndex + 1),
    [historyItems, lastUserPromptHistoryIndex],
  );

  const lastResponseHistoryItems = useMemo(
    () => historyItems.slice(lastUserPromptHistoryIndex + 1),
    [historyItems, lastUserPromptHistoryIndex],
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
          const isToolGroupBoundary =
            (item.type !== 'tool_group' && prevType === 'tool_group') ||
            (item.type === 'tool_group' && prevType !== 'tool_group');

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
              isToolGroupBoundary={isToolGroupBoundary}
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
    ],
  );

  const virtualizedData = useMemo(
    () => [
      { type: 'header' as const },
      ...augmentedHistory.map((data, index) => {
        if (data.type === 'history') {
          return {
            type: 'history' as const,
            item: data.item,
            element: historyItems[index],
          };
        } else {
          return {
            type: 'banner' as const,
            id: data.id,
            element: historyItems[index],
          };
        }
      }),
      { type: 'pending' as const },
    ],
    [augmentedHistory, historyItems],
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
      } else if (item.type === 'history' || item.type === 'banner') {
        return item.element;
      } else {
        return pendingItems;
      }
    },
    [showHeaderDetails, version, pendingItems],
  );

  const estimatedItemHeight = useCallback(() => 100, []);

  const keyExtractor = useCallback(
    (item: (typeof virtualizedData)[number], _index: number) => {
      if (item.type === 'header') return 'header';
      if (item.type === 'history') return item.item.id.toString();
      if (item.type === 'banner') return item.id;
      return 'pending';
    },
    [],
  );

  // TODO(jacobr): we should return true for all messages that are not
  // interactive. Gemini messages and Tool results that are not scrollable,
  // collapsible, or clickable should also be tagged as static in the future.
  const isStaticItem = useCallback(
    (item: (typeof virtualizedData)[number]) => item.type === 'header',
    [],
  );

  const scrollableList = useMemo(() => {
    if (isAlternateBufferOrTerminalBuffer) {
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
          overflowToBackbuffer={useTerminalBuffer && !isAlternateBuffer}
          scrollbar={mouseMode}
        />
        // TODO(jacobr): consider adding stableScrollback={!config.getUseAlternateBuffer()}
        // as that will reduce the # of cases where we will have to clear the
        // scrollback buffer due to the scrollback size changing but we need to
        // work out ensuring we only attempt it within a smaller range of
        // scrollback vals. Right now it sometimes triggers adding more white
        // space than it should.
      );
    }
    return null;
  }, [
    isAlternateBufferOrTerminalBuffer,
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
    isAlternateBuffer,
  ]);

  if (!uiState.isConfigInitialized) {
    return null;
  }

  if (isAlternateBufferOrTerminalBuffer) {
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
