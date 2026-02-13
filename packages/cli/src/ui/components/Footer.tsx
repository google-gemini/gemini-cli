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
import {
  getStatusColor,
  QUOTA_THRESHOLD_HIGH,
  QUOTA_THRESHOLD_MEDIUM,
} from '../utils/displayUtils.js';
import { DebugProfiler } from './DebugProfiler.js';
import { isDevelopment } from '../../utils/installationInfo.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useVimMode } from '../contexts/VimModeContext.js';

interface CwdIndicatorProps {
  targetDir: string;
  terminalWidth: number;
  debugMode?: boolean;
  debugMessage?: string;
  color?: string;
}

const CwdIndicator: React.FC<CwdIndicatorProps> = ({
  targetDir,
  terminalWidth,
  debugMode,
  debugMessage,
  color = theme.text.primary,
}) => {
  const pathLength = Math.max(20, Math.floor(terminalWidth * 0.25));
  const displayPath = shortenPath(tildeifyPath(targetDir), pathLength);
  return (
    <Text color={color}>
      {displayPath}
      {debugMode && (
        <Text color={theme.status.error}>
          {' ' + (debugMessage || '--debug')}
        </Text>
      )}
    </Text>
  );
};

interface BranchIndicatorProps {
  branchName: string;
  showParentheses?: boolean;
}

const BranchIndicator: React.FC<BranchIndicatorProps> = ({
  branchName,
  showParentheses = true,
}) => (
  <Text color={theme.text.secondary}>
    {showParentheses ? `(${branchName}*)` : `${branchName}*`}
  </Text>
);

interface SandboxIndicatorProps {
  isTrustedFolder: boolean | undefined;
  terminalWidth: number;
  showDocsHint?: boolean;
}

const SandboxIndicator: React.FC<SandboxIndicatorProps> = ({
  isTrustedFolder,
  terminalWidth,
  showDocsHint = false,
}) => {
  if (isTrustedFolder === false) {
    return <Text color={theme.status.warning}>untrusted</Text>;
  }

  const sandbox = process.env['SANDBOX'];
  if (sandbox && sandbox !== 'sandbox-exec') {
    return (
      <Text color="green">{sandbox.replace(/^gemini-(?:cli-)?/, '')}</Text>
    );
  }

  if (sandbox === 'sandbox-exec') {
    return (
      <Text color={theme.status.warning}>
        macOS Seatbelt{' '}
        <Text color={theme.text.secondary}>
          ({process.env['SEATBELT_PROFILE']})
        </Text>
      </Text>
    );
  }

  return (
    <Text color={theme.status.error}>
      no sandbox
      {showDocsHint && terminalWidth >= 100 && (
        <Text color={theme.text.secondary}> (see /docs)</Text>
      )}
    </Text>
  );
};

const CorgiIndicator: React.FC = () => (
  <Text>
    <Text color={theme.status.error}>▼</Text>
    <Text color={theme.text.primary}>(´</Text>
    <Text color={theme.status.error}>ᴥ</Text>
    <Text color={theme.text.primary}>`)</Text>
    <Text color={theme.status.error}>▼</Text>
  </Text>
);

interface ErrorIndicatorProps {
  errorCount: number;
}

const ErrorIndicator: React.FC<ErrorIndicatorProps> = ({ errorCount }) => (
  <Box flexDirection="row">
    <Text color={theme.ui.comment}>| </Text>
    <ConsoleSummaryDisplay errorCount={errorCount} />
  </Box>
);

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
              <Box flexDirection="row">
                <CwdIndicator
                  targetDir={targetDir}
                  terminalWidth={terminalWidth}
                  debugMode={debugMode}
                  debugMessage={debugMessage}
                />
                {branchName && (
                  <>
                    <Text> </Text>
                    <BranchIndicator branchName={branchName} />
                  </>
                )}
              </Box>
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
            <SandboxIndicator
              isTrustedFolder={isTrustedFolder}
              terminalWidth={terminalWidth}
              showDocsHint={true}
            />
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
              {showMemoryUsage && (
                <>
                  <Text color={theme.text.secondary}> | </Text>
                  <MemoryUsageDisplay />
                </>
              )}
            </Box>
            <Box alignItems="center">
              {corgiMode && (
                <Box paddingLeft={1} flexDirection="row">
                  <Text color={theme.ui.symbol}>| </Text>
                  <CorgiIndicator />
                </Box>
              )}
              {!showErrorDetails && errorCount > 0 && (
                <Box paddingLeft={1}>
                  <ErrorIndicator errorCount={errorCount} />
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
        addElement(
          id,
          <CwdIndicator
            targetDir={targetDir}
            terminalWidth={terminalWidth}
            debugMode={debugMode}
            debugMessage={debugMessage}
            color={theme.text.secondary}
          />,
        );
        break;
      }
      case 'git-branch': {
        if (branchName) {
          addElement(
            id,
            <BranchIndicator branchName={branchName} showParentheses={false} />,
          );
        }
        break;
      }
      case 'sandbox-status': {
        addElement(
          id,
          <SandboxIndicator
            isTrustedFolder={isTrustedFolder}
            terminalWidth={terminalWidth}
          />,
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
        if (
          quotaStats &&
          quotaStats.remaining !== undefined &&
          quotaStats.limit
        ) {
          const percentage = (quotaStats.remaining / quotaStats.limit) * 100;
          const color = getStatusColor(percentage, {
            green: QUOTA_THRESHOLD_HIGH,
            yellow: QUOTA_THRESHOLD_MEDIUM,
          });
          const text =
            quotaStats.remaining === 0
              ? 'limit reached'
              : `daily ${percentage.toFixed(0)}%`;
          addElement(id, <Text color={color}>{text}</Text>);
        }
        break;
      }
      case 'memory-usage': {
        addElement(id, <MemoryUsageDisplay />);
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
          let formatted: string;
          if (totalTokens >= 1_000_000_000) {
            formatted = `${(totalTokens / 1_000_000_000).toFixed(1)}b`;
          } else if (totalTokens >= 1_000_000) {
            formatted = `${(totalTokens / 1_000_000).toFixed(1)}m`;
          } else if (totalTokens >= 1000) {
            formatted = `${(totalTokens / 1000).toFixed(1)}k`;
          } else {
            formatted = totalTokens.toString();
          }
          addElement(
            id,
            <Text color={theme.text.secondary}>{formatted} tokens</Text>,
          );
        }
        break;
      }
      default:
        break;
    }
  }

  if (corgiMode) {
    addElement('corgi-transient', <CorgiIndicator />);
  }

  if (!showErrorDetails && errorCount > 0) {
    addElement(
      'error-count-transient',
      <ErrorIndicator errorCount={errorCount} />,
    );
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
