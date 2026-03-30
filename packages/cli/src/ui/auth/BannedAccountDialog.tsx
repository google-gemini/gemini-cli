/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import {
  openBrowserSecurely,
  shouldLaunchBrowser,
} from '@google/gemini-cli-core';
import { runExitCleanup } from '../../utils/cleanup.js';
import type { AccountSuspensionInfo } from '../contexts/UIStateContext.js';

interface BannedAccountDialogProps {
  accountSuspensionInfo: AccountSuspensionInfo;
  onExit: () => void;
  onChangeAuth: () => void;
}

export function BannedAccountDialog({
  accountSuspensionInfo,
  onExit,
  onChangeAuth,
}: BannedAccountDialogProps): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const appealUrl = accountSuspensionInfo.appealUrl;
  const appealLinkText =
    accountSuspensionInfo.appealLinkText ?? 'Open the Google Form';

  const items = useMemo(() => {
    const menuItems = [];
    if (appealUrl) {
      menuItems.push({
        label: appealLinkText,
        value: 'open_form' as const,
        key: 'open_form',
      });
    }
    menuItems.push(
      {
        label: 'Change authentication',
        value: 'change_auth' as const,
        key: 'change_auth',
      },
      {
        label: 'Exit',
        value: 'exit' as const,
        key: 'exit',
      },
    );
    return menuItems;
  }, [appealUrl, appealLinkText]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        void handleExit();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const handleExit = useCallback(async () => {
    await runExitCleanup();
    onExit();
  }, [onExit]);

  const handleSelect = useCallback(
    async (choice: string) => {
      if (choice === 'open_form' && appealUrl) {
        if (!shouldLaunchBrowser()) {
          setErrorMessage(`Please open this URL in a browser: ${appealUrl}`);
          return;
        }

        try {
          await openBrowserSecurely(appealUrl);
        } catch {
          setErrorMessage(`Failed to open browser. Please visit: ${appealUrl}`);
        }
      } else if (choice === 'change_auth') {
        onChangeAuth();
      } else {
        await handleExit();
      }
    },
    [handleExit, onChangeAuth, appealUrl],
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={theme.status.error}>
        Error: Account Suspended
      </Text>

      <Box marginTop={1}>
        <Text>{accountSuspensionInfo.message}</Text>
      </Box>

      {appealUrl && (
        <>
          <Box marginTop={1}>
            <Text>Appeal URL:</Text>
          </Box>
          <Box>
            <Text color={theme.text.link}>[{appealUrl}]</Text>
          </Box>
        </>
      )}

      {errorMessage && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{errorMessage}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          onSelect={(choice) => void handleSelect(choice)}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Escape to exit</Text>
      </Box>
    </Box>
  );
}
