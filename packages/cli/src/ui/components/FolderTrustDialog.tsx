/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { theme } from '../semantic-colors.js';
import stripAnsi from 'strip-ansi';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { MaxSizedBox } from './shared/MaxSizedBox.js';
import { Scrollable } from './shared/Scrollable.js';
import { useKeypress } from '../hooks/useKeypress.js';
import * as process from 'node:process';
import * as path from 'node:path';
import { relaunchApp } from '../../utils/processUtils.js';
import { runExitCleanup } from '../../utils/cleanup.js';
import {
  ExitCodes,
  type FolderDiscoveryResults,
} from '@google/gemini-cli-core';
import { useUIState } from '../contexts/UIStateContext.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { StickyHeader } from './StickyHeader.js';

export enum FolderTrustChoice {
  TRUST_FOLDER = 'trust_folder',
  TRUST_PARENT = 'trust_parent',
  DO_NOT_TRUST = 'do_not_trust',
}

interface FolderTrustDialogProps {
  onSelect: (choice: FolderTrustChoice) => void;
  isRestarting?: boolean;
  discoveryResults?: FolderDiscoveryResults | null;
}

export const FolderTrustDialog: React.FC<FolderTrustDialogProps> = ({
  onSelect,
  isRestarting,
  discoveryResults,
}) => {
  const [exiting, setExiting] = useState(false);
  const { terminalHeight, terminalWidth, constrainHeight } = useUIState();
  const isAlternateBuffer = useAlternateBuffer();

  const isExpanded = !constrainHeight;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isRestarting) {
      timer = setTimeout(async () => {
        await relaunchApp();
      }, 250);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isRestarting]);

  const handleExit = useCallback(() => {
    setExiting(true);
    // Give time for the UI to render the exiting message
    setTimeout(async () => {
      await runExitCleanup();
      process.exit(ExitCodes.FATAL_CANCELLATION_ERROR);
    }, 100);
  }, []);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        handleExit();
        return true;
      }
      return false;
    },
    { isActive: !isRestarting },
  );

  const dirName = path.basename(process.cwd());
  const parentFolder = path.basename(path.dirname(process.cwd()));

  const options: Array<RadioSelectItem<FolderTrustChoice>> = [
    {
      label: `Trust folder (${dirName})`,
      value: FolderTrustChoice.TRUST_FOLDER,
      key: `Trust folder (${dirName})`,
    },
    {
      label: `Trust parent folder (${parentFolder})`,
      value: FolderTrustChoice.TRUST_PARENT,
      key: `Trust parent folder (${parentFolder})`,
    },
    {
      label: "Don't trust",
      value: FolderTrustChoice.DO_NOT_TRUST,
      key: "Don't trust",
    },
  ];

  const hasDiscovery =
    discoveryResults &&
    (discoveryResults.commands.length > 0 ||
      discoveryResults.mcps.length > 0 ||
      discoveryResults.hooks.length > 0 ||
      discoveryResults.skills.length > 0 ||
      discoveryResults.settings.length > 0);

  const hasWarnings =
    discoveryResults && discoveryResults.securityWarnings.length > 0;

  const hasErrors =
    discoveryResults &&
    discoveryResults.discoveryErrors &&
    discoveryResults.discoveryErrors.length > 0;

  const dialogWidth = terminalWidth - 2;
  const borderColor = theme.status.warning;

  // Header: 3 lines
  // Options: options.length + 2 lines for margins
  // Footer: 1 line
  // Safety margin: 2 lines
  const overhead = 3 + options.length + 2 + 1 + 2;
  const scrollableHeight = Math.max(4, terminalHeight - overhead);

  const groups = [
    { label: 'Commands', items: discoveryResults?.commands ?? [] },
    { label: 'MCP Servers', items: discoveryResults?.mcps ?? [] },
    { label: 'Hooks', items: discoveryResults?.hooks ?? [] },
    { label: 'Skills', items: discoveryResults?.skills ?? [] },
    { label: 'Setting overrides', items: discoveryResults?.settings ?? [] },
  ].filter((g) => g.items.length > 0);

  const discoveryContent = (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.text.primary}>
          Trusting a folder allows Gemini CLI to load its local configurations,
          including custom commands, hooks, MCP servers, agent skills, and
          settings. These configurations could execute code on your behalf or
          change the behavior of the CLI.
        </Text>
      </Box>

      {hasErrors && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.status.error} bold>
            ❌ Discovery Errors:
          </Text>
          {discoveryResults.discoveryErrors.map((error, i) => (
            <Box key={i} marginLeft={2}>
              <Text color={theme.status.error}>• {stripAnsi(error)}</Text>
            </Box>
          ))}
        </Box>
      )}

      {hasWarnings && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.status.warning} bold>
            ⚠️ Security Warnings:
          </Text>
          {discoveryResults.securityWarnings.map((warning, i) => (
            <Box key={i} marginLeft={2}>
              <Text color={theme.status.warning}>• {stripAnsi(warning)}</Text>
            </Box>
          ))}
        </Box>
      )}

      {hasDiscovery && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.text.primary} bold>
            This folder contains:
          </Text>
          {groups.map((group) => (
            <Box key={group.label} flexDirection="column" marginLeft={2}>
              <Text color={theme.text.primary} bold>
                • {group.label} ({group.items.length}):
              </Text>
              {group.items.map((item, idx) => (
                <Box key={idx} marginLeft={2}>
                  <Text color={theme.text.primary}>- {stripAnsi(item)}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );

  const title = (
    <Text bold color={theme.text.primary}>
      Do you trust the files in this folder?
    </Text>
  );

  const selectOptions = (
    <RadioButtonSelect
      items={options}
      onSelect={onSelect}
      isFocused={!isRestarting}
    />
  );

  const renderContent = () => {
    if (isAlternateBuffer) {
      return (
        <Box flexDirection="column" width={dialogWidth}>
          <StickyHeader
            width={dialogWidth}
            isFirst={true}
            borderColor={borderColor}
            borderDimColor={false}
          >
            {title}
          </StickyHeader>

          <Box
            flexDirection="column"
            borderLeft={true}
            borderRight={true}
            borderColor={borderColor}
            borderStyle="round"
            borderTop={false}
            borderBottom={false}
            width={dialogWidth}
          >
            <Scrollable
              hasFocus={!isRestarting}
              height={scrollableHeight}
              width={dialogWidth - 2}
            >
              <Box flexDirection="column" paddingX={1}>
                {discoveryContent}
              </Box>
            </Scrollable>

            <Box paddingX={1} marginY={1}>
              {selectOptions}
            </Box>
          </Box>

          <Box
            height={0}
            width={dialogWidth}
            borderLeft={true}
            borderRight={true}
            borderTop={false}
            borderBottom={true}
            borderColor={borderColor}
            borderStyle="round"
          />
        </Box>
      );
    }

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={borderColor}
        padding={1}
        width="100%"
      >
        <Box marginBottom={1}>{title}</Box>

        <MaxSizedBox
          maxHeight={isExpanded ? undefined : Math.max(4, terminalHeight - 12)}
          overflowDirection="bottom"
        >
          {discoveryContent}
        </MaxSizedBox>

        <Box marginTop={1}>{selectOptions}</Box>
      </Box>
    );
  };

  const content = (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="column" marginLeft={1} marginRight={1}>
        {renderContent()}
      </Box>

      <Box paddingX={2} marginBottom={1}>
        <ShowMoreLines constrainHeight={constrainHeight} />
      </Box>

      {isRestarting && (
        <Box marginLeft={1} marginTop={1}>
          <Text color={theme.status.warning}>
            Gemini CLI is restarting to apply the trust changes...
          </Text>
        </Box>
      )}
      {exiting && (
        <Box marginLeft={1} marginTop={1}>
          <Text color={theme.status.warning}>
            A folder trust level must be selected to continue. Exiting since
            escape was pressed.
          </Text>
        </Box>
      )}
    </Box>
  );

  return isAlternateBuffer ? (
    <OverflowProvider>{content}</OverflowProvider>
  ) : (
    content
  );
};
