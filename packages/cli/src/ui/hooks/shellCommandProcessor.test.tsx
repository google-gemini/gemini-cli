/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, SpawnOptions } from 'child_process';
import { StringDecoder } from 'string_decoder';
import type { HistoryItemWithoutId } from '../types.js';
import { useCallback } from 'react';
import { Config, GeminiClient } from '@google/gemini-cli-core';
import { type PartListUnion } from '@google/genai';
import { formatMemoryUsage } from '../utils/formatters.js';
import { isBinary } from '../utils/textUtils.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';
import stripAnsi from 'strip-ansi';
import { useSudo } from '../contexts/SudoContext.js';

const OUTPUT_UPDATE_INTERVAL_MS = 1000;
const MAX_OUTPUT_LENGTH = 10000;

interface ShellExecutionResult {
  rawOutput: Buffer;
  output: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error: Error | null;
  aborted: boolean;
  finalPwd?: string;
}

function executeShellCommand(
  rawCommand: string,
  cwd: string,
  abortSignal: AbortSignal,
  onOutputChunk: (chunk: string) => void,
  onDebugMessage: (message: string) => void,
  sudoPassword?: string,
): Promise<ShellExecutionResult> {
  const isWindows = os.platform() === 'win32';
  const isSudo = !isWindows && rawCommand.trim().startsWith('sudo ');
  let commandToExecute = rawCommand;

  if (isSudo) {
    if (!sudoPassword) {
      return Promise.resolve({
        rawOutput: Buffer.from(''),
        output: 'Error: sudo password required, but not provided or has expired.\nRun a sudo command through the AI first to cache the password.',
        exitCode: 1,
        signal: null,
        error: new Error('Sudo password required.'),
        aborted: false,
      });
    }
    // NEW SECURE STRATEGY: Wrap the user's command
    const userCommand = rawCommand.trim();
    const escapedPassword = sudoPassword.replace(/'/g, "'\\''");
    commandToExecute = `echo '${escapedPassword}' | ${userCommand.replace('sudo', 'sudo -S --')}`;
  }

  return new Promise((resolve) => {
    let finalWrappedCommand = commandToExecute;
    let pwdFilePath: string | undefined;

    if (!isWindows) {
      let command = commandToExecute;
      const pwdFileName = `shell_pwd_${crypto.randomBytes(6).toString('hex')}.tmp`;
      pwdFilePath = path.join(os.tmpdir(), pwdFileName);
      if (!command.trim().endsWith('&')) {
        command += ';';
      }
      finalWrappedCommand = `{ ${command} }; __code=$?; pwd > "${pwdFilePath}"; exit $__code`;
    }

    const shell = isWindows ? 'cmd.exe' : 'bash';
    const shellArgs = isWindows
      ? ['/c', finalWrappedCommand]
      : ['-c', finalWrappedCommand];

    const spawnOptions: SpawnOptions = {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !isWindows,
    };

    onDebugMessage(`Executing in ${cwd}: ${finalWrappedCommand}`);
    const child = spawn(shell, shellArgs, spawnOptions);

    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let stdout = '';
    let stderr = '';
    const outputChunks: Buffer[] = [];
    let error: Error | null = null;
    let exited = false;
    let streamToUi = true;
    const MAX_SNIFF_SIZE = 4096;
    let sniffedBytes = 0;

    const handleOutput = (data: Buffer, stream: 'stdout' | 'stderr') => {
      outputChunks.push(data);
      if (streamToUi && sniffedBytes < MAX_SNIFF_SIZE) {
        const sniffBuffer = Buffer.concat(outputChunks.slice(0, 20));
        sniffedBytes = sniffBuffer.length;
        if (isBinary(sniffBuffer)) {
          streamToUi = false;
          onOutputChunk('[Binary output detected. Halting stream...]');
        }
      }
      const decodedChunk = stream === 'stdout' ? stdoutDecoder.write(data) : stderrDecoder.write(data);
      if (stream === 'stdout') {
        stdout += stripAnsi(decodedChunk);
      } else {
        stderr += stripAnsi(decodedChunk);
      }
      if (!exited && streamToUi) {
        const combinedOutput = stdout + (stderr ? `\n${stderr}` : '');
        onOutputChunk(combinedOutput);
      } else if (!exited && !streamToUi) {
        const totalBytes = outputChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        onOutputChunk(`[Receiving binary output... ${formatMemoryUsage(totalBytes)} received]`);
      }
    };

    if (child.stdout) {
      child.stdout.on('data', (data) => handleOutput(data, 'stdout'));
    }
    if (child.stderr) {
      child.stderr.on('data', (data) => handleOutput(data, 'stderr'));
    }
    child.on('error', (err) => { error = err; });

    const abortHandler = async () => {
      if (child.pid && !exited) {
        onDebugMessage(`Aborting shell command (PID: ${child.pid})`);
        if (isWindows) {
          spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t']);
        } else {
          try {
            process.kill(-child.pid, 'SIGTERM');
            await new Promise((res) => setTimeout(res, 200));
            if (!exited) process.kill(-child.pid, 'SIGKILL');
          } catch (_e) {
            if (!exited) child.kill('SIGKILL');
          }
        }
      }
    };
    abortSignal.addEventListener('abort', abortHandler, { once: true });

    child.on('exit', (code, signal) => {
      exited = true;
      abortSignal.removeEventListener('abort', abortHandler);
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      const finalBuffer = Buffer.concat(outputChunks);
      let finalPwd: string | undefined;
      if (pwdFilePath && fs.existsSync(pwdFilePath)) {
        finalPwd = fs.readFileSync(pwdFilePath, 'utf8').trim();
        fs.unlinkSync(pwdFilePath);
      }
      resolve({
        rawOutput: finalBuffer,
        output: stdout + (stderr ? `\n${stderr}` : ''),
        exitCode: code,
        signal,
        error,
        aborted: abortSignal.aborted,
        finalPwd,
      });
    });
  });
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
  geminiClient.addHistory({
    role: 'user',
    parts: [
      {
        text: `I ran the following shell command:\n\`\`\`sh\n${rawQuery}\n\`\`\`\n\nThis produced the following result:\n\`\`\`\n${modelContent}\n\`\`\``,
      },
    ],
  });
}

export const useShellCommandProcessor = (
  addItemToHistory: UseHistoryManagerReturn['addItem'],
  setPendingHistoryItem: React.Dispatch<React.SetStateAction<HistoryItemWithoutId | null>>,
  onExec: (command: Promise<void>) => void,
  onDebugMessage: (message: string) => void,
  config: Config,
  geminiClient: GeminiClient,
) => {
  const { getPassword: getSudoPassword, setPassword: setSudoPassword } = useSudo();

  const handleShellCommand = useCallback(
    (rawQuery: PartListUnion, abortSignal: AbortSignal): boolean => {
      if (typeof rawQuery !== 'string' || rawQuery.trim() === '') {
        return false;
      }
      const userMessageTimestamp = Date.now();
      addItemToHistory({ type: 'user_shell', text: rawQuery }, userMessageTimestamp);
      const targetDir = config.getTargetDir();

      const execPromise = new Promise<void>((resolve) => {
        let lastUpdateTime = 0;

        executeShellCommand(
          rawQuery,
          targetDir,
          abortSignal,
          (streamedOutput) => {
            if (Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
              setPendingHistoryItem({ type: 'info', text: streamedOutput });
              lastUpdateTime = Date.now();
            }
          },
          onDebugMessage,
          getSudoPassword(),
        )
          .then((result) => {
            setPendingHistoryItem(null);
            // If sudo failed, clear the bad password from context
            if (result.output.includes('sudo: sorry, try again')) {
              setSudoPassword('');
            }
            let historyItemType: HistoryItemWithoutId['type'] = 'info';
            let mainContent: string;
            if (isBinary(result.rawOutput)) {
              mainContent = '[Command produced binary output, which is not shown.]';
            } else {
              mainContent = result.output.trim() || '(Command produced no output)';
            }
            let finalOutput = mainContent;
            if (result.error) {
              historyItemType = 'error';
              finalOutput = `${result.error.message}\n${finalOutput}`;
            } else if (result.aborted) {
              finalOutput = `Command was cancelled.\n${finalOutput}`;
            } else if (result.signal) {
              historyItemType = 'error';
              finalOutput = `Command terminated by signal: ${result.signal}.\n${finalOutput}`;
            } else if (result.exitCode !== 0) {
              historyItemType = 'error';
              finalOutput = `Command exited with code ${result.exitCode}.\n${finalOutput}`;
            }
            if (result.finalPwd && result.finalPwd !== targetDir) {
              const warning = `WARNING: shell mode is stateless; the directory change to '${result.finalPwd}' will not persist.`;
              finalOutput = `${warning}\n\n${finalOutput}`;
            }
            addItemToHistory({ type: historyItemType, text: finalOutput }, userMessageTimestamp);
            addShellCommandToGeminiHistory(geminiClient, rawQuery, finalOutput);
          })
          .catch((err) => {
            setPendingHistoryItem(null);
            const errorMessage = err instanceof Error ? err.message : String(err);
            addItemToHistory({ type: 'error', text: `An unexpected error occurred: ${errorMessage}` }, userMessageTimestamp);
          })
          .finally(() => {
            resolve();
          });
      });

      onExec(execPromise);
      return true;
    },
    [config, onDebugMessage, addItemToHistory, setPendingHistoryItem, onExec, geminiClient, getSudoPassword, setSudoPassword],
  );

  return { handleShellCommand };
};