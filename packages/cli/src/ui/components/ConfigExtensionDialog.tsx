/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type { ExtensionManager } from '../../config/extension-manager.js';
import {
  configureExtension,
  configureSpecificSetting,
  configureAllExtensions,
  type ConfigLogger,
  type RequestSettingCallback,
  type RequestConfirmationCallback,
} from '../../commands/extensions/utils.js';
import {
  ExtensionSettingScope,
  type ExtensionSetting,
} from '../../config/extensions/extensionSettings.js';
import { TextInput } from './shared/TextInput.js';
import { useTextBuffer } from './shared/text-buffer.js';
import { DialogFooter } from './shared/DialogFooter.js';
import { type Key, useKeypress } from '../hooks/useKeypress.js';

export interface ConfigExtensionDialogProps {
  extensionManager: ExtensionManager;
  onClose: () => void;
  extensionName?: string;
  settingKey?: string;
  scope?: ExtensionSettingScope;
  configureAll?: boolean;
  loggerAdapter: ConfigLogger;
}

type DialogState =
  | { type: 'IDLE' }
  | { type: 'BUSY'; message?: string }
  | {
      type: 'ASK_SETTING';
      setting: ExtensionSetting;
      resolve: (val: string) => void;
      initialValue?: string;
    }
  | {
      type: 'ASK_CONFIRMATION';
      message: string;
      resolve: (val: boolean) => void;
    }
  | { type: 'DONE' }
  | { type: 'ERROR'; error: Error };

export const ConfigExtensionDialog: React.FC<ConfigExtensionDialogProps> = ({
  extensionManager,
  onClose,
  extensionName,
  settingKey,
  scope = ExtensionSettingScope.USER,
  configureAll,
  loggerAdapter,
}) => {
  const [state, setState] = useState<DialogState>({ type: 'IDLE' });
  const [logMessages, setLogMessages] = useState<string[]>([]);

  // Buffers for input
  const settingBuffer = useTextBuffer({
    initialText: '',
    viewport: { width: 80, height: 1 },
    singleLine: true,
    isValidPath: () => true,
  });

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const addLog = useCallback(
    (msg: string) => {
      setLogMessages((prev) => [...prev, msg].slice(-5)); // Keep last 5
      loggerAdapter.log(msg);
    },
    [loggerAdapter],
  );

  const requestSetting: RequestSettingCallback = useCallback(
    async (setting) =>
      new Promise<string>((resolve) => {
        if (!mounted.current) return;
        settingBuffer.setText(''); // Clear buffer
        setState({
          type: 'ASK_SETTING',
          setting,
          resolve: (val) => {
            resolve(val);
            setState({ type: 'BUSY', message: 'Updating...' });
          },
        });
      }),
    [settingBuffer],
  );

  const requestConfirmation: RequestConfirmationCallback = useCallback(
    async (message) =>
      new Promise<boolean>((resolve) => {
        if (!mounted.current) return;
        setState({
          type: 'ASK_CONFIRMATION',
          message,
          resolve: (val) => {
            resolve(val);
            setState({ type: 'BUSY', message: 'Processing...' });
          },
        });
      }),
    [],
  );

  useEffect(() => {
    async function run() {
      try {
        setState({ type: 'BUSY', message: 'Initializing...' });

        // Wrap logger to capture logs locally too
        const localLogger: ConfigLogger = {
          log: (msg) => {
            addLog(msg);
          },
          error: (msg) => {
            addLog('Error: ' + msg);
            loggerAdapter.error(msg);
          },
        };

        if (configureAll) {
          await configureAllExtensions(
            extensionManager,
            scope,
            localLogger,
            requestSetting,
            requestConfirmation,
          );
        } else if (extensionName && settingKey) {
          await configureSpecificSetting(
            extensionManager,
            extensionName,
            settingKey,
            scope,
            localLogger,
            requestSetting,
          );
        } else if (extensionName) {
          await configureExtension(
            extensionManager,
            extensionName,
            scope,
            localLogger,
            requestSetting,
            requestConfirmation,
          );
        }

        if (mounted.current) {
          setState({ type: 'DONE' });
          // Delay close slightly to show done
          setTimeout(onClose, 1000);
        }
      } catch (err: unknown) {
        if (mounted.current) {
          const error = err instanceof Error ? err : new Error(String(err));
          setState({ type: 'ERROR', error });
          loggerAdapter.error(error.message);
        }
      }
    }

    // Only run once
    if (state.type === 'IDLE') {
      void run();
    }
  }, [
    extensionManager,
    extensionName,
    settingKey,
    scope,
    configureAll,
    loggerAdapter,
    requestSetting,
    requestConfirmation,
    addLog,
    onClose,
    state.type,
  ]);

  // Handle Input Submission
  const handleSettingSubmit = (val: string) => {
    if (state.type === 'ASK_SETTING') {
      state.resolve(val);
    }
  };

  // Handle Keys for Confirmation
  useKeypress(
    (key: Key) => {
      if (state.type === 'ASK_CONFIRMATION') {
        if (key.name === 'y' || key.name === 'return') {
          state.resolve(true);
          return true;
        }
        if (key.name === 'n' || key.name === 'escape') {
          state.resolve(false);
          return true;
        }
      }
      if (state.type === 'DONE' || state.type === 'ERROR') {
        if (key.name === 'return' || key.name === 'escape') {
          onClose();
          return true;
        }
      }
      return false;
    },
    {
      isActive:
        state.type === 'ASK_CONFIRMATION' ||
        state.type === 'DONE' ||
        state.type === 'ERROR',
    },
  );

  if (state.type === 'BUSY' || state.type === 'IDLE') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        paddingX={1}
      >
        <Text color={theme.text.secondary}>
          {state.type === 'BUSY' ? state.message : 'Starting...'}
        </Text>
        {logMessages.map((msg, i) => (
          <Text key={i}>{msg}</Text>
        ))}
      </Box>
    );
  }

  if (state.type === 'ASK_SETTING') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        paddingX={1}
      >
        <Text bold color={theme.text.primary}>
          Configure {state.setting.name}
        </Text>
        <Text color={theme.text.secondary}>
          {state.setting.description || state.setting.envVar}
        </Text>
        <Box flexDirection="row" marginTop={1}>
          <Text color={theme.text.accent}>{'> '}</Text>
          <TextInput
            buffer={settingBuffer}
            onSubmit={handleSettingSubmit}
            focus={true}
            placeholder={`Enter value for ${state.setting.name}`}
          />
        </Box>
        <DialogFooter primaryAction="Enter to submit" />
      </Box>
    );
  }

  if (state.type === 'ASK_CONFIRMATION') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        paddingX={1}
      >
        <Text color={theme.status.warning} bold>
          Confirmation Required
        </Text>
        <Text>{state.message}</Text>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            Press{' '}
            <Text color={theme.text.accent} bold>
              Y
            </Text>{' '}
            to confirm or{' '}
            <Text color={theme.text.accent} bold>
              N
            </Text>{' '}
            to cancel
          </Text>
        </Box>
      </Box>
    );
  }

  if (state.type === 'ERROR') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.status.error}
        paddingX={1}
      >
        <Text color={theme.status.error} bold>
          Error
        </Text>
        <Text>{state.error.message}</Text>
        <DialogFooter primaryAction="Enter to close" />
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.status.success}
      paddingX={1}
    >
      <Text color={theme.status.success} bold>
        Configuration Complete
      </Text>
      <DialogFooter primaryAction="Enter to close" />
    </Box>
  );
};
