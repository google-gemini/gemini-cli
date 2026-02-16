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
  checkExhaustive,
} from '@google/gemini-cli-core';
import { ConsoleSummaryDisplay } from './ConsoleSummaryDisplay.js';
import process from 'node:process';
import { MemoryUsageDisplay } from './MemoryUsageDisplay.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';
import {
  QUOTA_THRESHOLD_HIGH,
  QUOTA_THRESHOLD_MEDIUM,
} from '../utils/displayUtils.js';
import { DebugProfiler } from './DebugProfiler.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import {
  ALL_ITEMS,
  type FooterItemId,
  deriveItemsFromLegacySettings,
} from '../../config/footerItems.js';

interface CwdIndicatorProps {
  targetDir: string;
  maxWidth: number;
  debugMode?: boolean;
  debugMessage?: string;
  color?: string;
}

const CwdIndicator: React.FC<CwdIndicatorProps> = ({
  targetDir,
  maxWidth,
  debugMode,
  debugMessage,
  color = theme.text.primary,
}) => {
  const debugSuffix = debugMode ? ' ' + (debugMessage || '--debug') : '';
  const availableForPath = Math.max(10, maxWidth - debugSuffix.length);
  const displayPath = shortenPath(tildeifyPath(targetDir), availableForPath);

  return (
    <Text color={color}>
      {displayPath}
      {debugMode && <Text color={theme.status.error}>{debugSuffix}</Text>}
    </Text>
  );
};

interface SandboxIndicatorProps {
  isTrustedFolder: boolean | undefined;
}

const SandboxIndicator: React.FC<SandboxIndicatorProps> = ({
  isTrustedFolder,
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
        <Text color={theme.ui.comment}>
          ({process.env['SEATBELT_PROFILE']})
        </Text>
      </Text>
    );
  }

  return <Text color={theme.status.error}>no sandbox</Text>;
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

export interface FooterRowItem {
  key: string;
  header: string;
  element: React.ReactNode;
}

const COLUMN_GAP = 3;

export const FooterRow: React.FC<{
  items: FooterRowItem[];
  showLabels: boolean;
}> = ({ items, showLabels }) => {
  const elements: React.ReactNode[] = [];

  items.forEach((item, idx) => {
    if (idx > 0 && !showLabels) {
      elements.push(
        <Box key={`sep-${item.key}`} height={1}>
          <Text color={theme.ui.comment}> · </Text>
        </Box>,
      );
    }

    elements.push(
      <Box key={item.key} flexDirection="column">
        {showLabels && (
          <Box height={1}>
            <Text color={theme.ui.comment}>{item.header}</Text>
          </Box>
        )}
        <Box height={1}>{item.element}</Box>
      </Box>,
    );
  });

  return (
    <Box
      flexDirection="row"
      flexWrap="nowrap"
      columnGap={showLabels ? COLUMN_GAP : 0}
    >
      {elements}
    </Box>
  );
};

function isFooterItemId(id: string): id is FooterItemId {
  return ALL_ITEMS.some((i) => i.id === id);
}

interface FooterColumn {
  id: string;
  header: string;
  element: (maxWidth: number) => React.ReactNode;
  width: number;
  isHighPriority: boolean;
}

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
  const items =
    settings.merged.ui.footer.items ??
    deriveItemsFromLegacySettings(settings.merged);
  const showLabels = settings.merged.ui.footer.showLabels !== false;
  const itemColor = showLabels ? theme.text.primary : theme.ui.comment;

  const potentialColumns: FooterColumn[] = [];

  const addCol = (
    id: string,
    header: string,
    element: (maxWidth: number) => React.ReactNode,
    dataWidth: number,
    isHighPriority = false,
  ) => {
    potentialColumns.push({
      id,
      header: showLabels ? header : '',
      element,
      width: Math.max(dataWidth, showLabels ? header.length : 0),
      isHighPriority,
    });
  };

  // 1. System Indicators (Far Left, high priority)
  if (uiState.showDebugProfiler) {
    addCol('debug', '', () => <DebugProfiler />, 45, true);
  }
  if (displayVimMode) {
    const vimStr = `[${displayVimMode}]`;
    addCol(
      'vim',
      '',
      () => <Text color={theme.text.accent}>{vimStr}</Text>,
      vimStr.length,
      true,
    );
  }

  // 2. Main Configurable Items
  for (const id of items) {
    if (!isFooterItemId(id)) continue;
    const itemConfig = ALL_ITEMS.find((i) => i.id === id);
    const header = itemConfig?.header ?? id;

    switch (id) {
      case 'cwd': {
        const fullPath = tildeifyPath(targetDir);
        const debugSuffix = debugMode ? ' ' + (debugMessage || '--debug') : '';
        addCol(
          id,
          header,
          (maxWidth) => (
            <CwdIndicator
              targetDir={targetDir}
              maxWidth={maxWidth}
              debugMode={debugMode}
              debugMessage={debugMessage}
              color={itemColor}
            />
          ),
          fullPath.length + debugSuffix.length,
        );
        break;
      }
      case 'git-branch': {
        if (branchName) {
          addCol(
            id,
            header,
            () => <Text color={itemColor}>{branchName}</Text>,
            branchName.length,
          );
        }
        break;
      }
      case 'sandbox-status': {
        let str = 'no sandbox';
        const sandbox = process.env['SANDBOX'];
        if (isTrustedFolder === false) str = 'untrusted';
        else if (sandbox === 'sandbox-exec')
          str = `macOS Seatbelt (${process.env['SEATBELT_PROFILE']})`;
        else if (sandbox) str = sandbox.replace(/^gemini-(?:cli-)?/, '');

        addCol(
          id,
          header,
          () => <SandboxIndicator isTrustedFolder={isTrustedFolder} />,
          str.length,
        );
        break;
      }
      case 'model-name': {
        const str = getDisplayString(model);
        addCol(
          id,
          header,
          () => <Text color={itemColor}>{str}</Text>,
          str.length,
        );
        break;
      }
      case 'context-remaining': {
        addCol(
          id,
          header,
          () => (
            <ContextUsageDisplay
              promptTokenCount={promptTokenCount}
              model={model}
              terminalWidth={terminalWidth}
              color={itemColor}
            />
          ),
          10, // "100% left" is 9 chars
        );
        break;
      }
      case 'quota': {
        if (quotaStats?.remaining !== undefined && quotaStats.limit) {
          const percentage = (quotaStats.remaining / quotaStats.limit) * 100;
          let color = itemColor;
          if (percentage < QUOTA_THRESHOLD_MEDIUM) {
            color = theme.status.error;
          } else if (percentage < QUOTA_THRESHOLD_HIGH) {
            color = theme.status.warning;
          }
          const text =
            quotaStats.remaining === 0
              ? 'limit reached'
              : `daily ${percentage.toFixed(0)}%`;
          addCol(
            id,
            header,
            () => <Text color={color}>{text}</Text>,
            text.length,
          );
        }
        break;
      }
      case 'memory-usage': {
        addCol(id, header, () => <MemoryUsageDisplay color={itemColor} />, 10);
        break;
      }
      case 'session-id': {
        addCol(
          id,
          header,
          () => (
            <Text color={itemColor}>
              {uiState.sessionStats.sessionId.slice(0, 8)}
            </Text>
          ),
          8,
        );
        break;
      }
      case 'code-changes': {
        const added = uiState.sessionStats.metrics.files.totalLinesAdded;
        const removed = uiState.sessionStats.metrics.files.totalLinesRemoved;
        if (added > 0 || removed > 0) {
          const str = `+${added} -${removed}`;
          addCol(
            id,
            header,
            () => (
              <Text>
                <Text color={theme.status.success}>+{added}</Text>{' '}
                <Text color={theme.status.error}>-{removed}</Text>
              </Text>
            ),
            str.length,
          );
        }
        break;
      }
      case 'token-count': {
        let total = 0;
        for (const m of Object.values(uiState.sessionStats.metrics.models))
          total += m.tokens.total;
        if (total > 0) {
          const formatted =
            new Intl.NumberFormat('en-US', {
              notation: 'compact',
              maximumFractionDigits: 1,
            })
              .format(total)
              .toLowerCase() + ' tokens';
          addCol(
            id,
            header,
            () => <Text color={itemColor}>{formatted}</Text>,
            formatted.length,
          );
        }
        break;
      }
      default:
        checkExhaustive(id);
        break;
    }
  }

  // 3. Transients
  if (corgiMode) addCol('corgi', '', () => <CorgiIndicator />, 5);
  if (!showErrorDetails && errorCount > 0) {
    addCol(
      'error-count',
      '',
      () => <ConsoleSummaryDisplay errorCount={errorCount} />,
      12,
      true,
    );
  }

  // --- Width Fitting Logic ---
  let currentWidth = 2; // Initial padding
  const columnsToRender: FooterColumn[] = [];
  let droppedAny = false;

  for (let i = 0; i < potentialColumns.length; i++) {
    const col = potentialColumns[i];
    const gap = columnsToRender.length > 0 ? (showLabels ? COLUMN_GAP : 3) : 0; // Use 3 for dot separator width
    const budgetWidth = col.id === 'cwd' ? 20 : col.width;

    if (
      col.isHighPriority ||
      currentWidth + gap + budgetWidth <= terminalWidth - 2
    ) {
      columnsToRender.push(col);
      currentWidth += gap + budgetWidth;
    } else {
      droppedAny = true;
    }
  }

  const totalBudgeted = columnsToRender.reduce(
    (sum, c, idx) =>
      sum +
      (c.id === 'cwd' ? 20 : c.width) +
      (idx > 0 ? (showLabels ? COLUMN_GAP : 3) : 0),
    2,
  );
  const excessSpace = Math.max(0, terminalWidth - totalBudgeted);

  const rowItems: FooterRowItem[] = columnsToRender.map((col) => {
    const maxWidth = col.id === 'cwd' ? 20 + excessSpace : col.width;
    return {
      key: col.id,
      header: col.header,
      element: col.element(maxWidth),
    };
  });

  if (droppedAny) {
    rowItems.push({
      key: 'ellipsis',
      header: '',
      element: <Text color={theme.ui.comment}>…</Text>,
    });
  }

  return (
    <Box width={terminalWidth} paddingX={1} overflow="hidden" flexWrap="nowrap">
      <FooterRow items={rowItems} showLabels={showLabels} />
    </Box>
  );
};
