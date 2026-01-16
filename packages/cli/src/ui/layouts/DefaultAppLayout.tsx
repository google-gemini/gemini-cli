/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type DOMElement, Box } from 'ink';
import { Notifications } from '../components/Notifications.js';
import { MainContent } from '../components/MainContent.js';
import { DialogManager } from '../components/DialogManager.js';
import { Composer } from '../components/Composer.js';
import { ExitWarning } from '../components/ExitWarning.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useFlickerDetector } from '../hooks/useFlickerDetector.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { CopyModeWarning } from '../components/CopyModeWarning.js';
import { useState, useRef, useCallback } from 'react';

export const DefaultAppLayout: React.FC = () => {
  const uiState = useUIState();
  const isAlternateBuffer = useAlternateBuffer();
  const [composerHeight, setComposerHeight] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const onRefChange = useCallback(
    (node: DOMElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      uiState.mainControlsRef.current = node;

      if (node && typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            setComposerHeight(entry.contentRect.height);
          }
        });
        observer.observe(node as unknown as Element);
        observerRef.current = observer;
      }
    },
    [uiState.mainControlsRef],
  );

  const { rootUiRef, terminalHeight } = uiState;
  useFlickerDetector(rootUiRef, terminalHeight);
  // If in alternate buffer mode, need to leave room to draw the scrollbar on
  // the right side of the terminal.
  const width = isAlternateBuffer
    ? uiState.terminalWidth
    : uiState.mainAreaWidth;
  return (
    <Box
      flexDirection="column"
      width={width}
      height={isAlternateBuffer ? terminalHeight - 1 : undefined}
      flexShrink={0}
      flexGrow={0}
      overflow="hidden"
      ref={uiState.rootUiRef}
    >
      <MainContent composerHeight={composerHeight} />

      <Box flexDirection="column" ref={onRefChange} flexShrink={0} flexGrow={0}>
        <Notifications />
        <CopyModeWarning />

        {uiState.customDialog ? (
          uiState.customDialog
        ) : uiState.dialogsVisible ? (
          <DialogManager
            terminalWidth={uiState.mainAreaWidth}
            addItem={uiState.historyManager.addItem}
          />
        ) : (
          <Composer />
        )}

        <ExitWarning />
      </Box>
    </Box>
  );
};
