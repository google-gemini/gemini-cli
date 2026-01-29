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
import { useCallback, useState, useRef, useEffect } from 'react';
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

export const OUTPUT_UPDATE_INTERVAL_MS = 1000;
const MAX_OUTPUT_LENGTH = 10000;

export interface BackgroundShell {
  pid: number;
  command: string;
  output: string | AnsiOutput;
  isBinary: boolean;
  binaryBytesReceived: number;
  status: 'running' | 'exited';
  exitCode?: number;
}

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
  const [activeShellPtyId, setActiveShellPtyId] = useState<number | null>(null);
  const [lastShellOutputTime, setLastShellOutputTime] = useState<number>(0);

  // Background shell state management
  const backgroundShellsRef = useRef<Map<number, BackgroundShell>>(new Map());
  const [backgroundShellCount, setBackgroundShellCount] = useState(0);
  const [isBackgroundShellVisible, setIsBackgroundShellVisible] =
    useState(false);

  // Sync ref with state for use in callbacks without stale closures
  const isVisibleRef = useRef(false);
  isVisibleRef.current = isBackgroundShellVisible;

  // Persistence state for auto-hiding background shell during foreground execution
  const wasVisibleBeforeForegroundRef = useRef(false);
  const restoreTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Used to force re-render when background shell output updates while visible
  const [, setTick] = useState(0);
  const notifyUpdate = useCallback(() => {
    if (isVisibleRef.current) {
      setTick((t) => t + 1);
    }
  }, []);

  const activePtyId = activeShellPtyId || activeToolPtyId;

  useEffect(() => {
    const isForegroundActive = !!activePtyId || !!isWaitingForConfirmation;

    if (isForegroundActive) {
      if (restoreTimeoutRef.current) {
        clearTimeout(restoreTimeoutRef.current);
        restoreTimeoutRef.current = null;
      }

      if (isVisibleRef.current) {
        wasVisibleBeforeForegroundRef.current = true;
        setIsBackgroundShellVisible(false);
      }
    } else if (
      wasVisibleBeforeForegroundRef.current &&
      !restoreTimeoutRef.current
    ) {
      // Restore if it was automatically hidden, with a small delay to avoid
      // flickering between model turn segments.
      restoreTimeoutRef.current = setTimeout(() => {
        setIsBackgroundShellVisible(true);
        wasVisibleBeforeForegroundRef.current = false;
        restoreTimeoutRef.current = null;
      }, 300);
    }

    return () => {
      if (restoreTimeoutRef.current) {
        clearTimeout(restoreTimeoutRef.current);
      }
    };
  }, [activePtyId, isWaitingForConfirmation]);

  const countRunningShells = useCallback(
    () =>
      Array.from(backgroundShellsRef.current.values()).filter(
        (s) => s.status === 'running',
      ).length,
    [],
  );

  const toggleBackgroundShell = useCallback(() => {
    if (backgroundShellsRef.current.size > 0) {
      setIsBackgroundShellVisible((prev) => !prev);
      wasVisibleBeforeForegroundRef.current = false;
    } else {
      setIsBackgroundShellVisible(false);
      addItemToHistory(
        {
          type: 'info',
          text: 'No background shells are currently active.',
        },
        Date.now(),
      );
    }
  }, [addItemToHistory]);

  const backgroundCurrentShell = useCallback(() => {
    const pidToBackground = activeShellPtyId || activeToolPtyId;
    if (pidToBackground) {
      ShellExecutionService.background(pidToBackground);
      wasVisibleBeforeForegroundRef.current = false;
    }
  }, [activeShellPtyId, activeToolPtyId]);

  const dismissBackgroundShell = useCallback(
    (pid: number) => {
      const shell = backgroundShellsRef.current.get(pid);
      if (shell) {
        if (shell.status === 'running') {
          ShellExecutionService.kill(pid);
        }
        // Always remove from UI list when dismissed, whether running (killed) or exited
        backgroundShellsRef.current.delete(pid);
        setBackgroundShellCount(countRunningShells());
        if (backgroundShellsRef.current.size === 0) {
          setIsBackgroundShellVisible(false);
        }
      }
    },
    [countRunningShells],
  );

  const registerBackgroundShell = useCallback(
    (pid: number, command: string, initialOutput: string | AnsiOutput) => {
      if (backgroundShellsRef.current.has(pid)) {
        return;
      }

      // Initialize background shell state
      backgroundShellsRef.current.set(pid, {
        pid,
        command,
        output: initialOutput,
        isBinary: false,
        binaryBytesReceived: 0,
        status: 'running',
      });

      // Subscribe to process exit directly
      ShellExecutionService.onExit(pid, (code) => {
        const shell = backgroundShellsRef.current.get(pid);
        if (shell) {
          // Remove and re-add to move to the end of the map (maintains insertion order)
          backgroundShellsRef.current.delete(pid);
          backgroundShellsRef.current.set(pid, {
            ...shell,
            status: 'exited',
            exitCode: code,
          });
          setBackgroundShellCount(countRunningShells());
          notifyUpdate();
        }
      });

      // Subscribe to future updates (data only)
      ShellExecutionService.subscribe(pid, (event) => {
        const shell = backgroundShellsRef.current.get(pid);
        if (!shell) return;

        if (event.type === 'data') {
          if (typeof event.chunk === 'string') {
            shell.output =
              typeof shell.output === 'string'
                ? shell.output + event.chunk
                : event.chunk;
          } else {
            shell.output = event.chunk;
          }
          return;
        } else if (event.type === 'binary_detected') {
          shell.isBinary = true;
        } else if (event.type === 'binary_progress') {
          shell.isBinary = true;
          shell.binaryBytesReceived = event.bytesReceived;
        } else {
          return;
        }

        notifyUpdate();
      });

      setBackgroundShellCount(countRunningShells());
    },
    [countRunningShells, notifyUpdate],
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

                if (
                  executionPid &&
                  backgroundShellsRef.current.has(executionPid)
                ) {
                  // If already backgrounded, let the background shell subscription handle it.
                  // We update the map so that switches show the latest output immediately.
                  const existingShell =
                    backgroundShellsRef.current.get(executionPid)!;
                  backgroundShellsRef.current.set(executionPid, {
                    ...existingShell,
                    output: cumulativeStdout,
                    isBinary: isBinaryStream,
                    binaryBytesReceived,
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
                  setLastShellOutputTime(Date.now());
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
            setActiveShellPtyId(pid);
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
            setActiveShellPtyId(null);
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

          if (result.error || result.aborted) {
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

          setActiveShellPtyId(null);
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
    ],
  );

  const backgroundShells = backgroundShellsRef.current;
  return {
    handleShellCommand,
    activeShellPtyId,
    lastShellOutputTime,
    backgroundShellCount,
    isBackgroundShellVisible,
    toggleBackgroundShell,
    backgroundCurrentShell,
    registerBackgroundShell,
    dismissBackgroundShell,
    backgroundShells,
  };
};
