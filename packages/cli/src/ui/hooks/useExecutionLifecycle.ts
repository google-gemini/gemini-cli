/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  HistoryItemWithoutId,
  IndividualToolCallDisplay,
} from '../types.js';
import { useCallback, useReducer, useRef, useEffect } from 'react';
import type {
  AnsiOutput,
  Config,
  GeminiClient,
  CompletionBehavior,
} from '@google/gemini-cli-core';
import {
  isBinary,
  ShellExecutionService,
  ExecutionLifecycleService,
  CoreToolCallStatus,
  escapeShellArg,
} from '@google/gemini-cli-core';
import { type PartListUnion } from '@google/genai';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { SHELL_COMMAND_NAME } from '../constants.js';
import { formatBytes } from '../utils/formatters.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { themeManager } from '../../ui/themes/theme-manager.js';
import {
  shellReducer,
  initialState,
  type BackgroundTask,
} from './shellReducer.js';
export { type BackgroundTask };

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

  // Escape backticks to prevent prompt injection breakouts
  const safeQuery = rawQuery.replace(/\\/g, '\\\\').replace(/\x60/g, '\\\x60');
  const safeModelContent = modelContent
    .replace(/\\/g, '\\\\')
    .replace(/\x60/g, '\\\x60');

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  geminiClient.addHistory({
    role: 'user',
    parts: [
      {
        text: `I ran the following shell command:\n\`\`\`sh\n${safeQuery}\n\`\`\`\n\nThis produced the following result:\n\`\`\`\n${safeModelContent}\n\`\`\``,
      },
    ],
  });
}

/**
 * Hook to process shell commands.
 * Orchestrates command execution and updates history and agent context.
 */
export const useExecutionLifecycle = (
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
  activeBackgroundExecutionId?: number,
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

  const activePtyId =
    state.activeShellPtyId ?? activeBackgroundExecutionId ?? undefined;

  useEffect(() => {
    const isForegroundActive = !!activePtyId || !!isWaitingForConfirmation;

    if (isForegroundActive) {
      if (m.restoreTimeout) {
        clearTimeout(m.restoreTimeout);
        m.restoreTimeout = null;
      }

      if (state.isBackgroundTaskVisible && !m.wasVisibleBeforeForeground) {
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
    state.isBackgroundTaskVisible,
    m,
    dispatch,
  ]);

  useEffect(
    () => () => {
      // Unsubscribe from all background task events on unmount
      for (const unsubscribe of m.subscriptions.values()) {
        unsubscribe();
      }
      m.subscriptions.clear();
    },
    [m],
  );

  const toggleBackgroundTasks = useCallback(() => {
    if (state.backgroundTasks.size > 0) {
      const willBeVisible = !state.isBackgroundTaskVisible;
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
        dispatch({ type: 'SYNC_BACKGROUND_TASKS' });
      }
    } else {
      dispatch({ type: 'SET_VISIBILITY', visible: false });
      addItemToHistory(
        {
          type: 'info',
          text: 'No background tasks are currently active.',
        },
        Date.now(),
      );
    }
  }, [
    addItemToHistory,
    state.backgroundTasks.size,
    state.isBackgroundTaskVisible,
    activePtyId,
    isWaitingForConfirmation,
    m,
    dispatch,
  ]);

  const backgroundCurrentExecution = useCallback(() => {
    const pidToBackground =
      state.activeShellPtyId ?? activeBackgroundExecutionId;
    if (pidToBackground) {
      // TRACK THE PID BEFORE TRIGGERING THE BACKGROUND ACTION
      // This prevents the onBackground listener from double-registering.
      m.backgroundedPids.add(pidToBackground);

      // Use ShellExecutionService for shell PTYs (handles log files, etc.),
      // fall back to ExecutionLifecycleService for non-shell executions
      // (e.g. remote agents, MCP tools, local agents).
      if (state.activeShellPtyId) {
        ShellExecutionService.background(pidToBackground);
      } else {
        ExecutionLifecycleService.background(pidToBackground);
      }
      // Ensure backgrounding is silent and doesn't trigger restoration
      m.wasVisibleBeforeForeground = false;
      if (m.restoreTimeout) {
        clearTimeout(m.restoreTimeout);
        m.restoreTimeout = null;
      }
    }
  }, [state.activeShellPtyId, activeBackgroundExecutionId, m]);

  const dismissBackgroundTask = useCallback(
    async (pid: number) => {
      const shell = state.backgroundTasks.get(pid);
      if (shell) {
        if (shell.status === 'running') {
          // ExecutionLifecycleService.kill handles both shell and non-shell
          // executions. For shells, ShellExecutionService.kill delegates to it.
          ExecutionLifecycleService.kill(pid);
        }
        dispatch({ type: 'DISMISS_TASK', pid });
        m.backgroundedPids.delete(pid);

        // Unsubscribe from updates
        const unsubscribe = m.subscriptions.get(pid);
        if (unsubscribe) {
          unsubscribe();
          m.subscriptions.delete(pid);
        }
      }
    },
    [state.backgroundTasks, dispatch, m],
  );

  const registerBackgroundTask = useCallback(
    (
      pid: number,
      command: string,
      initialOutput: string | AnsiOutput,
      completionBehavior?: CompletionBehavior,
    ) => {
      m.backgroundedPids.add(pid);
      dispatch({
        type: 'REGISTER_TASK',
        pid,
        command,
        initialOutput,
        completionBehavior,
      });

      // Subscribe to exit via ExecutionLifecycleService (works for all execution types)
      const exitUnsubscribe = ExecutionLifecycleService.onExit(pid, (code) => {
        dispatch({
          type: 'UPDATE_TASK',
          pid,
          update: { status: 'exited', exitCode: code },
        });
        // Auto-dismiss for inject/notify (output was delivered to conversation).
        // Silent tasks stay in the UI until manually dismissed.
        if (completionBehavior !== 'silent') {
          dispatch({ type: 'DISMISS_TASK', pid });
        }
        const unsub = m.subscriptions.get(pid);
        if (unsub) {
          unsub();
          m.subscriptions.delete(pid);
        }
        m.backgroundedPids.delete(pid);
      });

      // Subscribe to output via ExecutionLifecycleService (works for all execution types)
      const dataUnsubscribe = ExecutionLifecycleService.subscribe(
        pid,
        (event) => {
          if (event.type === 'data') {
            dispatch({
              type: 'APPEND_TASK_OUTPUT',
              pid,
              chunk: event.chunk,
            });
          } else if (event.type === 'binary_detected') {
            dispatch({
              type: 'UPDATE_TASK',
              pid,
              update: { isBinary: true },
            });
          } else if (event.type === 'binary_progress') {
            dispatch({
              type: 'UPDATE_TASK',
              pid,
              update: {
                isBinary: true,
                binaryBytesReceived: event.bytesReceived,
              },
            });
          }
        },
      );

      m.subscriptions.set(pid, () => {
        exitUnsubscribe();
        dataUnsubscribe();
      });
    },
    [dispatch, m],
  );

  // Auto-register any execution that gets backgrounded, regardless of type.
  // This is the agnostic hook: any tool that calls
  // ExecutionLifecycleService.createExecution() or attachExecution()
  // automatically gets Ctrl+B support — no UI changes needed per tool.
  useEffect(() => {
    const listener = (info: {
      executionId: number;
      label: string;
      output: string;
      completionBehavior: CompletionBehavior;
    }) => {
      // Skip if already registered (e.g. shells register via their own flow)
      if (m.backgroundedPids.has(info.executionId)) {
        return;
      }
      registerBackgroundTask(
        info.executionId,
        info.label,
        info.output,
        info.completionBehavior,
      );
    };
    ExecutionLifecycleService.onBackground(listener);
    return () => {
      ExecutionLifecycleService.offBackground(listener);
    };
  }, [registerBackgroundTask, m]);

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

      const executeCommand = async () => {
        let cumulativeStdout: string | AnsiOutput = '';
        let isBinaryStream = false;
        let binaryBytesReceived = 0;

        const initialToolDisplay: IndividualToolCallDisplay = {
          callId,
          name: SHELL_COMMAND_NAME,
          description: rawQuery,
          status: CoreToolCallStatus.Executing,
          isClientInitiated: true,
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

        try {
          // On non-windows, wrap the command to capture the final working directory.
          if (!isWindows) {
            let command = rawQuery.trim();
            if (command.endsWith('\\')) {
              command += ' ';
            }
            const tmpDir = fs.mkdtempSync(
              path.join(os.tmpdir(), 'gemini-shell-'),
            );
            pwdFilePath = path.join(tmpDir, 'pwd.tmp');
            const escapedPwdFilePath = escapeShellArg(pwdFilePath, 'bash');
            commandToExecute = `{\n${command}\n}\n__code=$?; pwd > ${escapedPwdFilePath}; exit $__code`;
          }

          onDebugMessage(`Executing in ${targetDir}: ${commandToExecute}`);

          const activeTheme = themeManager.getActiveTheme();
          const shellExecutionConfig = {
            ...config.getShellExecutionConfig(),
            sessionId: config.getSessionId(),
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
                    type: 'APPEND_TASK_OUTPUT',
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
            registerBackgroundTask(
              result.pid,
              rawQuery,
              cumulativeStdout,
              'notify',
            );
            dispatch({ type: 'SET_ACTIVE_PTY', pid: null });
          }

          let mainContent: string;
          if (isBinaryStream || isBinary(result.rawOutput)) {
            mainContent =
              '[Command produced binary output, which is not shown.]';
          } else {
            mainContent =
              result.output.trim() || '(Command produced no output)';
          }

          let finalOutput: string | AnsiOutput =
            result.ansiOutput && result.ansiOutput.length > 0
              ? result.ansiOutput
              : mainContent;
          let finalStatus = CoreToolCallStatus.Success;

          const prependToAnsiOutput = (
            output: AnsiOutput,
            text: string,
          ): AnsiOutput => {
            const newLines: AnsiOutput = text.split('\n').map((line) => [
              {
                text: line,
                fg: '',
                bg: '',
                dim: false,
                bold: false,
                italic: false,
                underline: false,
                inverse: false,
                isUninitialized: false,
              },
            ]);
            return [...newLines, [], ...output];
          };

          let prefix = '';

          if (result.error) {
            finalStatus = CoreToolCallStatus.Error;
            prefix = result.error.message;
          } else if (result.aborted) {
            finalStatus = CoreToolCallStatus.Cancelled;
            prefix = 'Command was cancelled.';
          } else if (result.backgrounded) {
            finalStatus = CoreToolCallStatus.Success;
            finalOutput = `Command moved to background (PID: ${result.pid}). Output hidden. Press Ctrl+B to view.`;
            mainContent = finalOutput;
          } else if (result.signal) {
            finalStatus = CoreToolCallStatus.Error;
            prefix = `Command terminated by signal: ${result.signal}.`;
          } else if (result.exitCode !== 0) {
            finalStatus = CoreToolCallStatus.Error;
            prefix = `Command exited with code ${result.exitCode}.`;
          }

          if (prefix) {
            finalOutput =
              typeof finalOutput === 'string'
                ? `${prefix}\n${finalOutput}`
                : prependToAnsiOutput(finalOutput, prefix);
            mainContent = `${prefix}\n${mainContent}`;
          }

          if (pwdFilePath && fs.existsSync(pwdFilePath)) {
            const finalPwd = fs.readFileSync(pwdFilePath, 'utf8').trim();
            if (finalPwd && finalPwd !== targetDir) {
              const warning = `WARNING: shell mode is stateless; the directory change to '${finalPwd}' will not persist.`;
              finalOutput =
                typeof finalOutput === 'string'
                  ? `${warning}\n\n${finalOutput}`
                  : prependToAnsiOutput(finalOutput, warning);
              mainContent = `${warning}\n\n${mainContent}`;
            }
          }

          const finalToolDisplay: IndividualToolCallDisplay = {
            ...initialToolDisplay,
            status: finalStatus,
            resultDisplay: finalOutput,
          };

          if (finalStatus !== CoreToolCallStatus.Cancelled) {
            addItemToHistory(
              {
                type: 'tool_group',
                tools: [finalToolDisplay],
              } as HistoryItemWithoutId,
              userMessageTimestamp,
            );
          }

          addShellCommandToGeminiHistory(geminiClient, rawQuery, mainContent);
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
          if (pwdFilePath) {
            const tmpDir = path.dirname(pwdFilePath);
            try {
              if (fs.existsSync(pwdFilePath)) {
                fs.unlinkSync(pwdFilePath);
              }
              if (fs.existsSync(tmpDir)) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
              }
            } catch {
              // Ignore cleanup errors
            }
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
      registerBackgroundTask,
      m,
      dispatch,
    ],
  );

  const backgroundTaskCount = Array.from(state.backgroundTasks.values()).filter(
    (s: BackgroundTask) => s.status === 'running',
  ).length;

  return {
    handleShellCommand,
    activeShellPtyId: state.activeShellPtyId,
    lastShellOutputTime: state.lastShellOutputTime,
    backgroundTaskCount,
    isBackgroundTaskVisible: state.isBackgroundTaskVisible,
    toggleBackgroundTasks,
    backgroundCurrentExecution,
    registerBackgroundTask,
    dismissBackgroundTask,
    backgroundTasks: state.backgroundTasks,
  };
};
