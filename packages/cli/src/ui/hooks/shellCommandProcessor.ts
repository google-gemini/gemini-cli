/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  HistoryItemWithoutId,
  IndividualToolCallDisplay,
} from '../types.js';
import { ToolCallStatus } from '../types.js';
import { useCallback, useReducer, useRef, useEffect } from 'react';
import type { AnsiOutput, Config, GeminiClient } from '@google/gemini-cli-core';
import { isBinary, ShellExecutionService } from '@google/gemini-cli-core';
import { type PartListUnion } from '@google/genai';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { SHELL_COMMAND_NAME } from '../constants.js';
import { formatBytes } from '../utils/formatters.js';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { themeManager } from '../../ui/themes/theme-manager.js';
import {
  shellReducer,
  initialState,
  type BackgroundShell,
} from './shellReducer.js';
export { type BackgroundShell };

export const OUTPUT_UPDATE_INTERVAL_MS = 1000;
const RESTORE_VISIBILITY_DELAY_MS = 300;
const MAX_OUTPUT_LENGTH = 10000;

function addShellCommandToGeminiHistory(
  geminiClient: GeminiClient,
  rawQuery: string,
  resultText: string,
) {
  const modelContent =
    resultText.length > MAX_OUTPUT_LENGTH
      ? resultText.substring(0, MAX_OUTPUT_LENGTH) + '\n... (truncated)'
      : resultText;

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  geminiClient.addHistory({
    role: 'user',
    parts: [
      {
        text: `I ran the following shell command:
\`\`\`sh
${rawQuery}
\`\`\`

This produced the following result:
\`\`\`
${modelContent}
\`\`\``,
      },
    ],
  });
}

/**
 * Hook to process shell commands.
 * Orchestrates command execution and updates history and agent context.
 */
export const useShellCommandProcessor = (
  addItemToHistory: UseHistoryManagerReturn['addItem'],
  setPendingHistoryItem: React.Dispatch<
    React.SetStateAction<HistoryItemWithoutId | null>
  >,
  onExec: (command: Promise<void>) => void,
  onDebugMessage: (message: string) => void,
  config: Config,
  geminiClient: GeminiClient,
  setShellInputFocused: (value: boolean) => void,
  terminalWidth?: number,
  terminalHeight?: number,
  activeToolPtyId?: number,
  isWaitingForConfirmation?: boolean,
) => {
  const [state, dispatch] = useReducer(shellReducer, initialState);

  // Consolidate stable tracking into a single manager object
  const manager = useRef<{
    wasVisibleBeforeForeground: boolean;
    restoreTimeout: NodeJS.Timeout | null;
    backgroundedPids: Set<number>;
    subscriptions: Map<number, () => void>;
  } | null>(null);

  if (!manager.current) {
    manager.current = {
      wasVisibleBeforeForeground: false,
      restoreTimeout: null,
      backgroundedPids: new Set(),
      subscriptions: new Map(),
    };
  }
  const m = manager.current;

  const activePtyId = state.activeShellPtyId || activeToolPtyId;

  useEffect(() => {
    const isForegroundActive = !!activePtyId || !!isWaitingForConfirmation;

    if (isForegroundActive) {
      if (m.restoreTimeout) {
        clearTimeout(m.restoreTimeout);
        m.restoreTimeout = null;
      }

      if (state.isBackgroundShellVisible && !m.wasVisibleBeforeForeground) {
        m.wasVisibleBeforeForeground = true;
        dispatch({ type: 'SET_VISIBILITY', visible: false });
      }
    } else if (m.wasVisibleBeforeForeground && !m.restoreTimeout) {
      // Restore if it was automatically hidden, with a small delay to avoid
      // flickering between model turn segments.
      m.restoreTimeout = setTimeout(() => {
        dispatch({ type: 'SET_VISIBILITY', visible: true });
        m.wasVisibleBeforeForeground = false;
        m.restoreTimeout = null;
      }, RESTORE_VISIBILITY_DELAY_MS);
    }

    return () => {
      if (m.restoreTimeout) {
        clearTimeout(m.restoreTimeout);
      }
    };
  }, [
    activePtyId,
    isWaitingForConfirmation,
    state.isBackgroundShellVisible,
    m,
    dispatch,
  ]);

  useEffect(
    () => () => {
      // Unsubscribe from all background shell events on unmount
      for (const unsubscribe of m.subscriptions.values()) {
        unsubscribe();
      }
      m.subscriptions.clear();
    },
    [m],
  );

  const toggleBackgroundShell = useCallback(() => {
    if (state.backgroundShells.size > 0) {
      const willBeVisible = !state.isBackgroundShellVisible;
      dispatch({ type: 'TOGGLE_VISIBILITY' });

      const isForegroundActive = !!activePtyId || !!isWaitingForConfirmation;
      // If we are manually showing it during foreground, we set the restore flag
      // so that useEffect doesn't immediately hide it again.
      // If we are manually hiding it, we clear the restore flag so it stays hidden.
      if (willBeVisible && isForegroundActive) {
        m.wasVisibleBeforeForeground = true;
      } else {
        m.wasVisibleBeforeForeground = false;
      }

      if (willBeVisible) {
        dispatch({ type: 'SYNC_BACKGROUND_SHELLS' });
      }
    } else {
      dispatch({ type: 'SET_VISIBILITY', visible: false });
      addItemToHistory(
        {
          type: 'info',
          text: 'No background shells are currently active.',
        },
        Date.now(),
      );
    }
  }, [
    addItemToHistory,
    state.backgroundShells.size,
    state.isBackgroundShellVisible,
    activePtyId,
    isWaitingForConfirmation,
    m,
    dispatch,
  ]);

  const backgroundCurrentShell = useCallback(() => {
    const pidToBackground = state.activeShellPtyId || activeToolPtyId;
    if (pidToBackground) {
      ShellExecutionService.background(pidToBackground);
      m.backgroundedPids.add(pidToBackground);
      // Ensure backgrounding is silent and doesn't trigger restoration
      m.wasVisibleBeforeForeground = false;
      if (m.restoreTimeout) {
        clearTimeout(m.restoreTimeout);
        m.restoreTimeout = null;
      }
    }
  }, [state.activeShellPtyId, activeToolPtyId, m]);

  const dismissBackgroundShell = useCallback(
    (pid: number) => {
      const shell = state.backgroundShells.get(pid);
      if (shell) {
        if (shell.status === 'running') {
          ShellExecutionService.kill(pid);
        }
        dispatch({ type: 'DISMISS_SHELL', pid });
        m.backgroundedPids.delete(pid);

        // Unsubscribe from updates
        const unsubscribe = m.subscriptions.get(pid);
        if (unsubscribe) {
          unsubscribe();
          m.subscriptions.delete(pid);
        }
      }
    },
    [state.backgroundShells, dispatch, m],
  );

  const registerBackgroundShell = useCallback(
    (pid: number, command: string, initialOutput: string | AnsiOutput) => {
      dispatch({ type: 'REGISTER_SHELL', pid, command, initialOutput });

      // Subscribe to process exit directly
      const exitUnsubscribe = ShellExecutionService.onExit(pid, (code) => {
        dispatch({
          type: 'UPDATE_SHELL',
          pid,
          update: { status: 'exited', exitCode: code },
        });
        m.backgroundedPids.delete(pid);
      });

      // Subscribe to future updates (data only)
      const dataUnsubscribe = ShellExecutionService.subscribe(pid, (event) => {
        if (event.type === 'data') {
          dispatch({ type: 'APPEND_SHELL_OUTPUT', pid, chunk: event.chunk });
        } else if (event.type === 'binary_detected') {
          dispatch({ type: 'UPDATE_SHELL', pid, update: { isBinary: true } });
        } else if (event.type === 'binary_progress') {
          dispatch({
            type: 'UPDATE_SHELL',
            pid,
            update: {
              isBinary: true,
              binaryBytesReceived: event.bytesReceived,
            },
          });
        }
      });

      m.subscriptions.set(pid, () => {
        exitUnsubscribe();
        dataUnsubscribe();
      });
    },
    [dispatch, m],
  );

  const handleShellCommand = useCallback(
    (rawQuery: PartListUnion, abortSignal: AbortSignal): boolean => {
      if (typeof rawQuery !== 'string' || rawQuery.trim() === '') {
        return false;
      }

      const userMessageTimestamp = Date.now();
      const callId = `shell-${userMessageTimestamp}`;
      addItemToHistory(
        { type: 'user_shell', text: rawQuery },
        userMessageTimestamp,
      );

      const isWindows = os.platform() === 'win32';
      const targetDir = config.getTargetDir();
      let commandToExecute = rawQuery;
      let pwdFilePath: string | undefined;

      // On non-windows, wrap the command to capture the final working directory.
      if (!isWindows) {
        let command = rawQuery.trim();
        const pwdFileName = `shell_pwd_${crypto.randomBytes(6).toString('hex')}.tmp`;
        pwdFilePath = path.join(os.tmpdir(), pwdFileName);
        // Ensure command ends with a separator before adding our own.
        if (!command.endsWith(';') && !command.endsWith('&')) {
          command += ';';
        }
        commandToExecute = `{ ${command} }; __code=$?; pwd > "${pwdFilePath}"; exit $__code`;
      }

      const executeCommand = async () => {
        let cumulativeStdout: string | AnsiOutput = '';
        let isBinaryStream = false;
        let binaryBytesReceived = 0;

        const initialToolDisplay: IndividualToolCallDisplay = {
          callId,
          name: SHELL_COMMAND_NAME,
          description: rawQuery,
          status: ToolCallStatus.Executing,
          resultDisplay: '',
          confirmationDetails: undefined,
        };

        setPendingHistoryItem({
          type: 'tool_group',
          tools: [initialToolDisplay],
        });

        let executionPid: number | undefined;

        const abortHandler = () => {
          onDebugMessage(
            `Aborting shell command (PID: ${executionPid ?? 'unknown'})`,
          );
        };
        abortSignal.addEventListener('abort', abortHandler, { once: true });

        onDebugMessage(`Executing in ${targetDir}: ${commandToExecute}`);

        try {
          const activeTheme = themeManager.getActiveTheme();
          const shellExecutionConfig = {
            ...config.getShellExecutionConfig(),
            terminalWidth,
            terminalHeight,
            defaultFg: activeTheme.colors.Foreground,
            defaultBg: activeTheme.colors.Background,
          };

          const { pid, result: resultPromise } =
            await ShellExecutionService.execute(
              commandToExecute,
              targetDir,
              (event) => {
                let shouldUpdate = false;

                switch (event.type) {
                  case 'data':
                    if (isBinaryStream) break;
                    if (typeof event.chunk === 'string') {
                      if (typeof cumulativeStdout === 'string') {
                        cumulativeStdout += event.chunk;
                      } else {
                        cumulativeStdout = event.chunk;
                      }
                    } else {
                      // AnsiOutput (PTY) is always the full state
                      cumulativeStdout = event.chunk;
                    }
                    shouldUpdate = true;
                    break;
                  case 'binary_detected':
                    isBinaryStream = true;
                    shouldUpdate = true;
                    break;
                  case 'binary_progress':
                    isBinaryStream = true;
                    binaryBytesReceived = event.bytesReceived;
                    shouldUpdate = true;
                    break;
                  case 'exit':
                    // No action needed for exit event during streaming
                    break;
                  default:
                    throw new Error('An unhandled ShellOutputEvent was found.');
                }

                if (executionPid && m.backgroundedPids.has(executionPid)) {
                  // If already backgrounded, let the background shell subscription handle it.
                  dispatch({
                    type: 'APPEND_SHELL_OUTPUT',
                    pid: executionPid,
                    chunk:
                      event.type === 'data' ? event.chunk : cumulativeStdout,
                  });
                  return;
                }

                let currentDisplayOutput: string | AnsiOutput;
                if (isBinaryStream) {
                  currentDisplayOutput =
                    binaryBytesReceived > 0
                      ? `[Receiving binary output... ${formatBytes(binaryBytesReceived)} received]`
                      : '[Binary output detected. Halting stream...]';
                } else {
                  currentDisplayOutput = cumulativeStdout;
                }

                if (shouldUpdate) {
                  dispatch({ type: 'SET_OUTPUT_TIME', time: Date.now() });
                  setPendingHistoryItem((prevItem) => {
                    if (prevItem?.type === 'tool_group') {
                      return {
                        ...prevItem,
                        tools: prevItem.tools.map((tool) =>
                          tool.callId === callId
                            ? { ...tool, resultDisplay: currentDisplayOutput }
                            : tool,
                        ),
                      };
                    }
                    return prevItem;
                  });
                }
              },
              abortSignal,
              config.getEnableInteractiveShell(),
              shellExecutionConfig,
            );

          executionPid = pid;
          if (pid) {
            dispatch({ type: 'SET_ACTIVE_PTY', pid });
            setPendingHistoryItem((prevItem) => {
              if (prevItem?.type === 'tool_group') {
                return {
                  ...prevItem,
                  tools: prevItem.tools.map((tool) =>
                    tool.callId === callId ? { ...tool, ptyId: pid } : tool,
                  ),
                };
              }
              return prevItem;
            });
          }

          const result = await resultPromise;
          setPendingHistoryItem(null);

          if (result.backgrounded && result.pid) {
            registerBackgroundShell(result.pid, rawQuery, cumulativeStdout);
            dispatch({ type: 'SET_ACTIVE_PTY', pid: null });
          }

          let mainContent: string;
          if (isBinary(result.rawOutput)) {
            mainContent =
              '[Command produced binary output, which is not shown.]';
          } else {
            mainContent =
              result.output.trim() || '(Command produced no output)';
          }

          let finalOutput = mainContent;
          let finalStatus = ToolCallStatus.Success;

          if (result.error) {
            finalStatus = ToolCallStatus.Error;
            finalOutput = `${result.error.message}\n${finalOutput}`;
          } else if (result.aborted) {
            finalStatus = ToolCallStatus.Canceled;
            finalOutput = `Command was cancelled.\n${finalOutput}`;
          } else if (result.backgrounded) {
            finalStatus = ToolCallStatus.Success;
            finalOutput = `Command moved to background (PID: ${result.pid}). Output hidden. Press Ctrl+B to view.`;
          } else if (result.signal) {
            finalStatus = ToolCallStatus.Error;
            finalOutput = `Command terminated by signal: ${result.signal}.\n${finalOutput}`;
          } else if (result.exitCode !== 0) {
            finalStatus = ToolCallStatus.Error;
            finalOutput = `Command exited with code ${result.exitCode}.\n${finalOutput}`;
          }

          if (pwdFilePath && fs.existsSync(pwdFilePath)) {
            const finalPwd = fs.readFileSync(pwdFilePath, 'utf8').trim();
            if (finalPwd && finalPwd !== targetDir) {
              const warning = `WARNING: shell mode is stateless; the directory change to '${finalPwd}' will not persist.`;
              finalOutput = `${warning}\n\n${finalOutput}`;
            }
          }

          const finalToolDisplay: IndividualToolCallDisplay = {
            ...initialToolDisplay,
            status: finalStatus,
            resultDisplay: finalOutput,
          };

          if (finalStatus !== ToolCallStatus.Canceled) {
            addItemToHistory(
              {
                type: 'tool_group',
                tools: [finalToolDisplay],
              } as HistoryItemWithoutId,
              userMessageTimestamp,
            );
          }

          addShellCommandToGeminiHistory(geminiClient, rawQuery, finalOutput);
        } catch (err) {
          setPendingHistoryItem(null);
          const errorMessage = err instanceof Error ? err.message : String(err);
          addItemToHistory(
            {
              type: 'error',
              text: `An unexpected error occurred: ${errorMessage}`,
            },
            userMessageTimestamp,
          );
        } finally {
          abortSignal.removeEventListener('abort', abortHandler);
          if (pwdFilePath && fs.existsSync(pwdFilePath)) {
            fs.unlinkSync(pwdFilePath);
          }

          dispatch({ type: 'SET_ACTIVE_PTY', pid: null });
          setShellInputFocused(false);
        }
      };

      onExec(executeCommand());
      return true;
    },
    [
      config,
      onDebugMessage,
      addItemToHistory,
      setPendingHistoryItem,
      onExec,
      geminiClient,
      setShellInputFocused,
      terminalHeight,
      terminalWidth,
      registerBackgroundShell,
      m,
      dispatch,
    ],
  );

  const backgroundShellCount = Array.from(
    state.backgroundShells.values(),
  ).filter((s: BackgroundShell) => s.status === 'running').length;

  return {
    handleShellCommand,
    activeShellPtyId: state.activeShellPtyId,
    lastShellOutputTime: state.lastShellOutputTime,
    backgroundShellCount,
    isBackgroundShellVisible: state.isBackgroundShellVisible,
    toggleBackgroundShell,
    backgroundCurrentShell,
    registerBackgroundShell,
    dismissBackgroundShell,
    backgroundShells: state.backgroundShells,
  };
};
