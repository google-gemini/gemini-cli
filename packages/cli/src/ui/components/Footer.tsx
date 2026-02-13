/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import {
  shortenPath,
  tildeifyPath,
  getDisplayString,
} from '@google/gemini-cli-core';
import { ConsoleSummaryDisplay } from './ConsoleSummaryDisplay.js';
import process from 'node:process';
import { MemoryUsageDisplay } from './MemoryUsageDisplay.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';
import { QuotaDisplay } from './QuotaDisplay.js';
import { DebugProfiler } from './DebugProfiler.js';
import { isDevelopment } from '../../utils/installationInfo.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useVimMode } from '../contexts/VimModeContext.js';

export const Footer: React.FC = () => {
  const uiState = useUIState();
  const config = useConfig();
  const settings = useSettings();
  const { vimEnabled, vimMode } = useVimMode();

  const {
    model,
    targetDir,
    debugMode,
    branchName,
    debugMessage,
    corgiMode,
    errorCount,
    showErrorDetails,
    promptTokenCount,
    isTrustedFolder,
    terminalWidth,
    quotaStats,
  } = {
    model: uiState.currentModel,
    targetDir: config.getTargetDir(),
    debugMode: config.getDebugMode(),
    branchName: uiState.branchName,
    debugMessage: uiState.debugMessage,
    corgiMode: uiState.corgiMode,
    errorCount: uiState.errorCount,
    showErrorDetails: uiState.showErrorDetails,
    promptTokenCount: uiState.sessionStats.lastPromptTokenCount,
    isTrustedFolder: uiState.isTrustedFolder,
    terminalWidth: uiState.terminalWidth,
    quotaStats: uiState.quota.stats,
  };

  const displayVimMode = vimEnabled ? vimMode : undefined;

  const hasCustomItems = settings.merged.ui.footer.items != null;

  if (!hasCustomItems) {
    const showMemoryUsage =
      config.getDebugMode() || settings.merged.ui.showMemoryUsage;
    const hideCWD = settings.merged.ui.footer.hideCWD;
    const hideSandboxStatus = settings.merged.ui.footer.hideSandboxStatus;
    const hideModelInfo = settings.merged.ui.footer.hideModelInfo;
    const hideContextPercentage =
      settings.merged.ui.footer.hideContextPercentage;

    const pathLength = Math.max(20, Math.floor(terminalWidth * 0.25));
    const displayPath = shortenPath(tildeifyPath(targetDir), pathLength);

    const justifyContent =
      hideCWD && hideModelInfo ? 'center' : 'space-between';

    const showDebugProfiler = debugMode || isDevelopment;

    return (
      <Box
        justifyContent={justifyContent}
        width={terminalWidth}
        flexDirection="row"
        alignItems="center"
        paddingX={1}
      >
        {(showDebugProfiler || displayVimMode || !hideCWD) && (
          <Box>
            {showDebugProfiler && <DebugProfiler />}
            {displayVimMode && (
              <Text color={theme.text.secondary}>[{displayVimMode}] </Text>
            )}
            {!hideCWD && (
              <Text color={theme.text.primary}>
                {displayPath}
                {branchName && (
                  <Text color={theme.text.secondary}> ({branchName}*)</Text>
                )}
              </Text>
            )}
            {debugMode && (
              <Text color={theme.status.error}>
                {' ' + (debugMessage || '--debug')}
              </Text>
            )}
          </Box>
        )}

        {/* Middle Section: Centered Trust/Sandbox Info */}
        {!hideSandboxStatus && (
          <Box
            flexGrow={1}
            alignItems="center"
            justifyContent="center"
            display="flex"
          >
            {isTrustedFolder === false ? (
              <Text color={theme.status.warning}>untrusted</Text>
            ) : process.env['SANDBOX'] &&
              process.env['SANDBOX'] !== 'sandbox-exec' ? (
              <Text color="green">
                {process.env['SANDBOX'].replace(/^gemini-(?:cli-)?/, '')}
              </Text>
            ) : process.env['SANDBOX'] === 'sandbox-exec' ? (
              <Text color={theme.status.warning}>
                macOS Seatbelt{' '}
                <Text color={theme.text.secondary}>
                  ({process.env['SEATBELT_PROFILE']})
                </Text>
              </Text>
            ) : (
              <Text color={theme.status.error}>
                no sandbox
                {terminalWidth >= 100 && (
                  <Text color={theme.text.secondary}> (see /docs)</Text>
                )}
              </Text>
            )}
          </Box>
        )}

        {/* Right Section: Gemini Label and Console Summary */}
        {!hideModelInfo && (
          <Box alignItems="center" justifyContent="flex-end">
            <Box alignItems="center">
              <Text color={theme.text.primary}>
                <Text color={theme.text.secondary}>/model </Text>
                {getDisplayString(model)}
                {!hideContextPercentage && (
                  <>
                    {' '}
                    <ContextUsageDisplay
                      promptTokenCount={promptTokenCount}
                      model={model}
                      terminalWidth={terminalWidth}
                    />
                  </>
                )}
                {quotaStats && (
                  <>
                    {' '}
                    <QuotaDisplay
                      remaining={quotaStats.remaining}
                      limit={quotaStats.limit}
                      resetTime={quotaStats.resetTime}
                      terse={true}
                    />
                  </>
                )}
              </Text>
              {showMemoryUsage && <MemoryUsageDisplay />}
            </Box>
            <Box alignItems="center">
              {corgiMode && (
                <Box paddingLeft={1} flexDirection="row">
                  <Text>
                    <Text color={theme.ui.symbol}>| </Text>
                    <Text color={theme.status.error}>▼</Text>
                    <Text color={theme.text.primary}>(´</Text>
                    <Text color={theme.status.error}>ᴥ</Text>
                    <Text color={theme.text.primary}>`)</Text>
                    <Text color={theme.status.error}>▼</Text>
                  </Text>
                </Box>
              )}
              {!showErrorDetails && errorCount > 0 && (
                <Box paddingLeft={1} flexDirection="row">
                  <Text color={theme.ui.comment}>| </Text>
                  <ConsoleSummaryDisplay errorCount={errorCount} />
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  // Items-based rendering path
  const items = settings.merged.ui.footer.items ?? [];
  const elements: React.ReactNode[] = [];

  const addElement = (id: string, element: React.ReactNode) => {
    if (elements.length > 0) {
      elements.push(
        <Text key={`sep-${id}`} color={theme.text.secondary}>
          {' | '}
        </Text>,
      );
    }
    elements.push(<Box key={id}>{element}</Box>);
  };

  // Prepend Vim mode if enabled
  if (displayVimMode) {
    elements.push(
      <Box key="vim-mode-static">
        <Text color={theme.text.secondary}>[{displayVimMode}] </Text>
      </Box>,
    );
  }

  for (const id of items) {
    switch (id) {
      case 'cwd': {
        const pathLength = Math.max(20, Math.floor(terminalWidth * 0.25));
        const displayPath = shortenPath(tildeifyPath(targetDir), pathLength);
        addElement(
          id,
          <Text color={theme.text.secondary}>
            {displayPath}
            {debugMode && (
              <Text color={theme.status.error}>
                {' ' + (debugMessage || '--debug')}
              </Text>
            )}
          </Text>,
        );
        break;
      }
      case 'git-branch': {
        if (branchName) {
          addElement(
            id,
            <Text color={theme.text.secondary}>{branchName}*</Text>,
          );
        }
        break;
      }
      case 'sandbox-status': {
        addElement(
          id,
          isTrustedFolder === false ? (
            <Text color={theme.status.warning}>untrusted</Text>
          ) : process.env['SANDBOX'] &&
            process.env['SANDBOX'] !== 'sandbox-exec' ? (
            <Text color="green">
              {process.env['SANDBOX'].replace(/^gemini-(?:cli-)?/, '')}
            </Text>
          ) : process.env['SANDBOX'] === 'sandbox-exec' ? (
            <Text color={theme.status.warning}>
              macOS Seatbelt{' '}
              <Text color={theme.text.secondary}>
                ({process.env['SEATBELT_PROFILE']})
              </Text>
            </Text>
          ) : (
            <Text color={theme.status.error}>no sandbox</Text>
          ),
        );
        break;
      }
      case 'model-name': {
        addElement(
          id,
          <Text color={theme.text.secondary}>{getDisplayString(model)}</Text>,
        );
        break;
      }
      case 'context-remaining': {
        addElement(
          id,
          <ContextUsageDisplay
            promptTokenCount={promptTokenCount}
            model={model}
            terminalWidth={terminalWidth}
          />,
        );
        break;
      }
      case 'quota': {
        if (quotaStats) {
          addElement(
            id,
            <QuotaDisplay
              remaining={quotaStats.remaining}
              limit={quotaStats.limit}
              resetTime={quotaStats.resetTime}
              terse={true}
            />,
          );
        }
        break;
      }
      case 'memory-usage': {
        addElement(id, <MemoryUsageDisplay />);
        break;
      }
      case 'error-count': {
        if (!showErrorDetails && errorCount > 0) {
          addElement(id, <ConsoleSummaryDisplay errorCount={errorCount} />);
        }
        break;
      }
      case 'session-id': {
        const idShort = uiState.sessionStats.sessionId.slice(0, 8);
        addElement(id, <Text color={theme.text.secondary}>{idShort}</Text>);
        break;
      }
      case 'code-changes': {
        const added = uiState.sessionStats.metrics.files.totalLinesAdded;
        const removed = uiState.sessionStats.metrics.files.totalLinesRemoved;
        if (added > 0 || removed > 0) {
          addElement(
            id,
            <Text>
              <Text color={theme.status.success}>+{added}</Text>{' '}
              <Text color={theme.status.error}>-{removed}</Text>
            </Text>,
          );
        }
        break;
      }
      case 'token-count': {
        let totalTokens = 0;
        for (const m of Object.values(uiState.sessionStats.metrics.models)) {
          totalTokens += m.tokens.total;
        }
        if (totalTokens > 0) {
          const formatted =
            totalTokens > 1000
              ? `${(totalTokens / 1000).toFixed(1)}k`
              : totalTokens;
          addElement(
            id,
            <Text color={theme.text.secondary}>tokens:{formatted}</Text>,
          );
        }
        break;
      }
      case 'corgi': {
        if (corgiMode) {
          addElement(
            id,
            <Text>
              <Text color={theme.status.error}>▼</Text>
              <Text color={theme.text.primary}>(´</Text>
              <Text color={theme.status.error}>ᴥ</Text>
              <Text color={theme.text.primary}>`)</Text>
              <Text color={theme.status.error}>▼</Text>
            </Text>,
          );
        }
        break;
      }
      default:
        break;
    }
  }

  return (
    <Box
      width={terminalWidth}
      flexDirection="row"
      alignItems="center"
      paddingX={1}
      flexWrap="nowrap"
      overflow="hidden"
    >
      {elements}
    </Box>
  );
};
