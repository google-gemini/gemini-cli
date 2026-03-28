/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import { Box, Text, ResizeObserver, type DOMElement } from 'ink';
import {
  isUserVisibleHook,
  type ThoughtSummary,
} from '@google/gemini-cli-core';
import stripAnsi from 'strip-ansi';
import { type ActiveHook } from '../types.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { theme } from '../semantic-colors.js';
import { GENERIC_WORKING_LABEL } from '../textConstants.js';
import { INTERACTIVE_SHELL_WAITING_PHRASE } from '../hooks/usePhraseCycler.js';
import { LoadingIndicator } from './LoadingIndicator.js';
import { StatusDisplay } from './StatusDisplay.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';
import { HorizontalLine } from './shared/HorizontalLine.js';
import { ApprovalModeIndicator } from './ApprovalModeIndicator.js';
import { ShellModeIndicator } from './ShellModeIndicator.js';
import { RawMarkdownIndicator } from './RawMarkdownIndicator.js';
import { useComposerStatus } from '../hooks/useComposerStatus.js';

/**
 * Layout constants to prevent magic numbers.
 */
const LAYOUT = {
  STATUS_MIN_HEIGHT: 1,
  TIP_LEFT_MARGIN: 2,
  TIP_RIGHT_MARGIN_NARROW: 0,
  TIP_RIGHT_MARGIN_WIDE: 1,
  INDICATOR_LEFT_MARGIN: 1,
  CONTEXT_DISPLAY_TOP_MARGIN_NARROW: 1,
  CONTEXT_DISPLAY_LEFT_MARGIN_NARROW: 1,
  CONTEXT_DISPLAY_LEFT_MARGIN_WIDE: 0,
  COLLISION_GAP: 10,
};

interface StatusRowProps {
  showUiDetails: boolean;
  isNarrow: boolean;
  terminalWidth: number;
  hideContextSummary: boolean;
  hideUiDetailsForSuggestions: boolean;
  hasPendingActionRequired: boolean;
}

/**
 * Renders the loading or hook execution status.
 */
export const StatusNode: React.FC<{
  showTips: boolean;
  showWit: boolean;
  thought: ThoughtSummary | null;
  elapsedTime: number;
  currentWittyPhrase: string | undefined;
  activeHooks: ActiveHook[];
  showLoadingIndicator: boolean;
  errorVerbosity: 'low' | 'full' | undefined;
  onResize?: (width: number) => void;
}> = ({
  showTips,
  showWit,
  thought,
  elapsedTime,
  currentWittyPhrase,
  activeHooks,
  showLoadingIndicator,
  errorVerbosity,
  onResize,
}) => {
  const observerRef = useRef<ResizeObserver | null>(null);

  const onRefChange = useCallback(
    (node: DOMElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (node && onResize) {
        const observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            onResize(Math.round(entry.contentRect.width));
          }
        });
        observer.observe(node);
        observerRef.current = observer;
      }
    },
    [onResize],
  );

  if (activeHooks.length === 0 && !showLoadingIndicator) return null;

  let currentLoadingPhrase: string | undefined = undefined;
  let currentThought: ThoughtSummary | null = null;

  if (activeHooks.length > 0) {
    const userVisibleHooks = activeHooks.filter((h) =>
      isUserVisibleHook(h.source),
    );

    if (userVisibleHooks.length > 0) {
      const label =
        userVisibleHooks.length > 1 ? 'Executing Hooks' : 'Executing Hook';
      const displayNames = userVisibleHooks.map((h) => {
        let name = stripAnsi(h.name);
        if (h.index && h.total && h.total > 1) {
          name += ` (${h.index}/${h.total})`;
        }
        return name;
      });
      currentLoadingPhrase = `${label}: ${displayNames.join(', ')}`;
    } else {
      currentLoadingPhrase = GENERIC_WORKING_LABEL;
    }
  } else {
    // Sanitize thought subject to prevent terminal injection
    currentThought = thought
      ? { ...thought, subject: stripAnsi(thought.subject) }
      : null;
  }

  return (
    <Box ref={onRefChange}>
      <LoadingIndicator
        inline
        showTips={showTips}
        showWit={showWit}
        errorVerbosity={errorVerbosity}
        thought={currentThought}
        currentLoadingPhrase={currentLoadingPhrase}
        elapsedTime={elapsedTime}
        forceRealStatusOnly={false}
        wittyPhrase={currentWittyPhrase}
      />
    </Box>
  );
};

export const StatusRow: React.FC<StatusRowProps> = ({
  showUiDetails,
  isNarrow,
  terminalWidth,
  hideContextSummary,
  hideUiDetailsForSuggestions,
  hasPendingActionRequired,
}) => {
  const uiState = useUIState();
  const settings = useSettings();
  const {
    isInteractiveShellWaiting,
    showLoadingIndicator,
    showTips,
    showWit,
    modeContentObj,
    showMinimalContext,
  } = useComposerStatus();

  const [statusWidth, setStatusWidth] = useState(0);
  const [tipWidth, setTipWidth] = useState(0);
  const tipObserverRef = useRef<ResizeObserver | null>(null);

  const onTipRefChange = useCallback((node: DOMElement | null) => {
    if (tipObserverRef.current) {
      tipObserverRef.current.disconnect();
      tipObserverRef.current = null;
    }

    if (node) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const width = Math.round(entry.contentRect.width);
          // Only update if width > 0 to prevent layout feedback loops
          // when the tip is hidden. This ensures we always use the
          // intrinsic width for collision detection.
          if (width > 0) {
            setTipWidth(width);
          }
        }
      });
      observer.observe(node);
      tipObserverRef.current = observer;
    }
  }, []);

  const tipContentStr = (() => {
    // 1. Proactive Tip (Priority)
    if (
      showTips &&
      uiState.currentTip &&
      !(
        isInteractiveShellWaiting &&
        uiState.currentTip === INTERACTIVE_SHELL_WAITING_PHRASE
      )
    ) {
      return uiState.currentTip;
    }

    // 2. Shortcut Hint (Fallback)
    if (
      settings.merged.ui.showShortcutsHint &&
      !hideUiDetailsForSuggestions &&
      !hasPendingActionRequired &&
      uiState.buffer.text.length === 0
    ) {
      return showUiDetails ? '? for shortcuts' : 'press tab twice for more';
    }

    return undefined;
  })();

  // Collision detection using measured widths
  const willCollideTip =
    statusWidth + tipWidth + LAYOUT.COLLISION_GAP > terminalWidth;

  const showTipLine = Boolean(
    !hasPendingActionRequired && tipContentStr && !willCollideTip && !isNarrow,
  );

  const showRow1Minimal =
    showLoadingIndicator || uiState.activeHooks.length > 0 || showTipLine;
  const showRow2Minimal =
    (Boolean(modeContentObj) && !hideUiDetailsForSuggestions) ||
    showMinimalContext;

  const showRow1 = showUiDetails || showRow1Minimal;
  const showRow2 = showUiDetails || showRow2Minimal;

  const onStatusResize = useCallback((width: number) => {
    if (width > 0) setStatusWidth(width);
  }, []);

  const statusNode = (
    <StatusNode
      showTips={showTips}
      showWit={showWit}
      thought={uiState.thought}
      elapsedTime={uiState.elapsedTime}
      currentWittyPhrase={uiState.currentWittyPhrase}
      activeHooks={uiState.activeHooks}
      showLoadingIndicator={showLoadingIndicator}
      errorVerbosity={
        settings.merged.ui.errorVerbosity as 'low' | 'full' | undefined
      }
      onResize={onStatusResize}
    />
  );

  const renderTipNode = () => {
    if (!tipContentStr) return null;

    const isShortcutHint =
      tipContentStr === '? for shortcuts' ||
      tipContentStr === 'press tab twice for more';
    const color =
      isShortcutHint && uiState.shortcutsHelpVisible
        ? theme.text.accent
        : theme.text.secondary;

    return (
      <Box flexDirection="row" justifyContent="flex-end" ref={onTipRefChange}>
        <Text
          color={color}
          wrap="truncate-end"
          italic={
            !isShortcutHint && tipContentStr === uiState.currentWittyPhrase
          }
        >
          {tipContentStr === uiState.currentTip
            ? `Tip: ${tipContentStr}`
            : tipContentStr}
        </Text>
      </Box>
    );
  };

  if (!showUiDetails && !showRow1Minimal && !showRow2Minimal) {
    return <Box height={LAYOUT.STATUS_MIN_HEIGHT} />;
  }

  return (
    <Box flexDirection="column" width="100%">
      {/* Row 1: Status & Tips */}
      {showRow1 && (
        <Box
          width="100%"
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          minHeight={LAYOUT.STATUS_MIN_HEIGHT}
        >
          <Box flexDirection="row" flexGrow={1} flexShrink={1}>
            {!showUiDetails && showRow1Minimal ? (
              <Box flexDirection="row" columnGap={1}>
                {statusNode}
                {!showUiDetails && showRow2Minimal && modeContentObj && (
                  <Box>
                    <Text color={modeContentObj.color}>
                      ● {modeContentObj.text}
                    </Text>
                  </Box>
                )}
              </Box>
            ) : isInteractiveShellWaiting ? (
              <Box width="100%" marginLeft={LAYOUT.INDICATOR_LEFT_MARGIN}>
                <Text color={theme.status.warning}>
                  ! Shell awaiting input (Tab to focus)
                </Text>
              </Box>
            ) : (
              <Box
                flexDirection="row"
                alignItems={isNarrow ? 'flex-start' : 'center'}
                flexGrow={1}
                flexShrink={0}
                marginLeft={LAYOUT.INDICATOR_LEFT_MARGIN}
              >
                {statusNode}
              </Box>
            )}
          </Box>

          <Box
            flexShrink={0}
            marginLeft={showTipLine ? LAYOUT.TIP_LEFT_MARGIN : 0}
            marginRight={
              showTipLine
                ? isNarrow
                  ? LAYOUT.TIP_RIGHT_MARGIN_NARROW
                  : LAYOUT.TIP_RIGHT_MARGIN_WIDE
                : 0
            }
            position={showTipLine ? 'relative' : 'absolute'}
            {...(showTipLine ? {} : { top: -100, left: -100 })}
          >
            {/* 
                We always render the tip node so it can be measured by ResizeObserver.
                When hidden, we use absolute positioning so it can still be measured 
                but doesn't affect the layout of Row 1. This prevents layout loops.
            */}
            {!isNarrow && tipContentStr && renderTipNode()}
          </Box>
        </Box>
      )}

      {/* Internal Separator */}
      {showRow1 &&
        showRow2 &&
        (showUiDetails || (showRow1Minimal && showRow2Minimal)) && (
          <Box width="100%">
            <HorizontalLine dim />
          </Box>
        )}

      {/* Row 2: Modes & Context */}
      {showRow2 && (
        <Box
          width="100%"
          flexDirection={isNarrow ? 'column' : 'row'}
          alignItems={isNarrow ? 'flex-start' : 'center'}
          justifyContent="space-between"
        >
          <Box
            flexDirection="row"
            alignItems="center"
            marginLeft={LAYOUT.INDICATOR_LEFT_MARGIN}
          >
            {showUiDetails ? (
              <>
                {!hideUiDetailsForSuggestions && !uiState.shellModeActive && (
                  <ApprovalModeIndicator
                    approvalMode={uiState.showApprovalModeIndicator}
                    allowPlanMode={uiState.allowPlanMode}
                  />
                )}
                {uiState.shellModeActive && (
                  <Box marginLeft={LAYOUT.INDICATOR_LEFT_MARGIN}>
                    <ShellModeIndicator />
                  </Box>
                )}
                {!uiState.renderMarkdown && (
                  <Box marginLeft={LAYOUT.INDICATOR_LEFT_MARGIN}>
                    <RawMarkdownIndicator />
                  </Box>
                )}
              </>
            ) : (
              showRow2Minimal &&
              modeContentObj && (
                <Text color={modeContentObj.color}>
                  ● {modeContentObj.text}
                </Text>
              )
            )}
          </Box>
          <Box
            marginTop={isNarrow ? LAYOUT.CONTEXT_DISPLAY_TOP_MARGIN_NARROW : 0}
            flexDirection="row"
            alignItems="center"
            marginLeft={
              isNarrow
                ? LAYOUT.CONTEXT_DISPLAY_LEFT_MARGIN_NARROW
                : LAYOUT.CONTEXT_DISPLAY_LEFT_MARGIN_WIDE
            }
          >
            {(showUiDetails || showMinimalContext) && (
              <StatusDisplay hideContextSummary={hideContextSummary} />
            )}
            {showMinimalContext && !showUiDetails && (
              <Box marginLeft={LAYOUT.INDICATOR_LEFT_MARGIN}>
                <ContextUsageDisplay
                  promptTokenCount={uiState.sessionStats.lastPromptTokenCount}
                  model={
                    typeof uiState.currentModel === 'string'
                      ? uiState.currentModel
                      : undefined
                  }
                  terminalWidth={terminalWidth}
                />
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
