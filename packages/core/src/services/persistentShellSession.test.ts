/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { PersistentShellSession } from './persistentShellSession.js';
import { getPty } from '../utils/getPty.js';
import { EventEmitter } from 'node:events';

vi.mock('../utils/getPty.js');
vi.mock('node:child_process');
vi.mock('../utils/shell-utils.js', async () => {
  const actual = await vi.importActual('../utils/shell-utils.js');
  return {
    ...actual,
    getShellConfiguration: vi.fn().mockReturnValue({
      executable: 'bash',
      argsPrefix: ['-c'],
      shell: 'bash',
    }),
    resolveExecutable: vi.fn().mockResolvedValue('/bin/bash'),
  };
});

describe('PersistentShellSession', () => {
  let mockPtyProcess: {
    pid: number;
    write: Mock;
    onData: Mock;
    onExit: Mock;
    kill: Mock;
    emit: (event: string, ...args: unknown[]) => boolean;
    on: (event: string, cb: (...args: unknown[]) => void) => unknown;
    removeListener: (
      event: string,
      cb: (...args: unknown[]) => void,
    ) => unknown;
  };
  let onOutputEventMock: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    onOutputEventMock = vi.fn();

    // @ts-expect-error - EventEmitter is used as a base but we add more properties
    mockPtyProcess = new EventEmitter();
    mockPtyProcess.pid = 123;
    mockPtyProcess.write = vi.fn();
    mockPtyProcess.onData = vi.fn((cb) => {
      mockPtyProcess.on('data', cb);
      return { dispose: () => mockPtyProcess.removeListener('data', cb) };
    });
    mockPtyProcess.onExit = vi.fn((cb) => {
      mockPtyProcess.on('exit', cb);
      return { dispose: () => mockPtyProcess.removeListener('exit', cb) };
    });
    mockPtyProcess.kill = vi.fn();

    (getPty as Mock).mockResolvedValue({
      module: {
        spawn: vi.fn().mockReturnValue(mockPtyProcess),
      },
    });
  });

  it('should initialize and run a command', async () => {
    const session = new PersistentShellSession({
      sanitizationConfig: {
        allowedEnvironmentVariables: [],
        blockedEnvironmentVariables: [],
        enableEnvironmentVariableRedaction: false,
      },
    });

    const abortController = new AbortController();

    // Start execution
    const executePromise = session.execute(
      'ls',
      process.cwd(),
      onOutputEventMock,
      abortController.signal,
    );

    // 1. Wait for bootstrap write
    await vi.waitFor(() => {
      if (mockPtyProcess.write.mock.calls.length === 0)
        throw new Error('No write yet');
    });
    const bootstrapCall = mockPtyProcess.write.mock.calls[0][0];
    expect(bootstrapCall).toContain('echo INIT_');
    const initMarker = bootstrapCall.match(/INIT_[a-z0-9]+/)[0];

    // 2. Resolve bootstrap
    mockPtyProcess.emit('data', `${initMarker}\n`);

    // 3. Wait for command write
    await vi.waitFor(() => {
      if (mockPtyProcess.write.mock.calls.length < 2)
        throw new Error('No command write yet');
    });
    const commandCall = mockPtyProcess.write.mock.calls[1][0];
    expect(commandCall).toContain('ls');
    expect(commandCall).toContain('echo "___GEMINI""_EXIT_CODE_');

    const startMarkerMatch = commandCall.match(
      /"___GEMINI""(_START_MARKER_[a-z0-9]+___)"/,
    );
    const startMarker = startMarkerMatch
      ? `___GEMINI${startMarkerMatch[1]}`
      : '___GEMINI_START_MARKER___';

    // 4. Send command output and exit marker
    mockPtyProcess.emit(
      'data',
      `${startMarker}\nfile1.txt\n___GEMINI_EXIT_CODE_0___\n`,
    );

    const result = await executePromise;
    expect(result.output).toBe('file1.txt');
    expect(result.exitCode).toBe(0);
  });

  it('should persist state between commands', async () => {
    const session = new PersistentShellSession({
      sanitizationConfig: {
        allowedEnvironmentVariables: [],
        blockedEnvironmentVariables: [],
        enableEnvironmentVariableRedaction: false,
      },
    });

    const p1 = session.execute(
      'export FOO=bar',
      process.cwd(),
      vi.fn(),
      new AbortController().signal,
    );

    // Bootstrap
    await vi.waitFor(() => expect(mockPtyProcess.write).toHaveBeenCalled());
    const initMarker =
      mockPtyProcess.write.mock.calls[0][0].match(/INIT_[a-z0-9]+/)[0];
    mockPtyProcess.emit('data', `${initMarker}\n`);

    // Cmd 1
    await vi.waitFor(() =>
      expect(mockPtyProcess.write).toHaveBeenCalledTimes(2),
    );
    let commandCall = mockPtyProcess.write.mock.calls[1][0];
    let startMarkerMatch = commandCall.match(
      /"___GEMINI""(_START_MARKER_[a-z0-9]+___)"/,
    );
    let startMarker = startMarkerMatch
      ? `___GEMINI${startMarkerMatch[1]}`
      : '___GEMINI_START_MARKER___';
    mockPtyProcess.emit('data', `${startMarker}\n___GEMINI_EXIT_CODE_0___\n`);
    await p1;

    // Cmd 2
    const p2 = session.execute(
      'echo $FOO',
      process.cwd(),
      onOutputEventMock,
      new AbortController().signal,
    );
    await vi.waitFor(() =>
      expect(mockPtyProcess.write).toHaveBeenCalledTimes(3),
    );
    commandCall = mockPtyProcess.write.mock.calls[2][0];
    startMarkerMatch = commandCall.match(
      /"___GEMINI""(_START_MARKER_[a-z0-9]+___)"/,
    );
    startMarker = startMarkerMatch
      ? `___GEMINI${startMarkerMatch[1]}`
      : '___GEMINI_START_MARKER___';
    mockPtyProcess.emit(
      'data',
      `${startMarker}\nbar\n___GEMINI_EXIT_CODE_0___\n`,
    );

    const result = await p2;
    expect(result.output).toBe('bar');
  });

  it('should handle abort and successfully run the next command', async () => {
    const session = new PersistentShellSession({
      sanitizationConfig: {
        allowedEnvironmentVariables: [],
        blockedEnvironmentVariables: [],
        enableEnvironmentVariableRedaction: false,
      },
    });

    const abortController1 = new AbortController();
    const p1 = session.execute(
      'sleep 10',
      process.cwd(),
      vi.fn(),
      abortController1.signal,
    );

    // Bootstrap first PTY
    await vi.waitFor(() => expect(mockPtyProcess.write).toHaveBeenCalled());
    const initMarker1 =
      mockPtyProcess.write.mock.calls[0][0].match(/INIT_[a-z0-9]+/)[0];
    mockPtyProcess.emit('data', `${initMarker1}\n`);

    // Command 1 write
    await vi.waitFor(() =>
      expect(mockPtyProcess.write).toHaveBeenCalledTimes(2),
    );

    // Now abort!
    abortController1.abort();

    // The abortHandler will wait 1000ms, then call kill() and resolve.
    // We need to wait for this to happen.
    await vi.waitFor(
      () => {
        // Check if kill was called
        if (mockPtyProcess.kill.mock.calls.length === 0)
          throw new Error('Not killed yet');
      },
      { timeout: 2000 },
    );

    // Resolve the promise from execution
    const res1 = await p1;
    expect(res1.aborted).toBe(true);

    // Now execute command 2
    const abortController2 = new AbortController();
    const onOutputMock2 = vi.fn();
    const p2 = session.execute(
      'ls -l',
      process.cwd(),
      onOutputMock2,
      abortController2.signal,
    );

    // Bootstrap second PTY (triggered by ensuring initialization after kill)
    await vi.waitFor(() =>
      expect(mockPtyProcess.write).toHaveBeenCalledTimes(4),
    );
    const initMarker2 =
      mockPtyProcess.write.mock.calls[3][0].match(/INIT_[a-z0-9]+/)[0];
    mockPtyProcess.emit('data', `${initMarker2}\n`);

    // Command 2 write
    await vi.waitFor(() =>
      expect(mockPtyProcess.write).toHaveBeenCalledTimes(5),
    );

    const commandCall2 = mockPtyProcess.write.mock.calls[4][0];
    const startMarkerMatch2 = commandCall2.match(
      /"___GEMINI""(_START_MARKER_[a-z0-9]+___)"/,
    );
    const startMarker2 = startMarkerMatch2
      ? `___GEMINI${startMarkerMatch2[1]}`
      : '___GEMINI_START_MARKER___';

    mockPtyProcess.emit(
      'data',
      `${startMarker2}\noutput of ls\n___GEMINI_EXIT_CODE_0___\n`,
    );

    const res2 = await p2;
    expect(res2.output).toBe('output of ls');
    expect(res2.exitCode).toBe(0);
    expect(onOutputMock2).toHaveBeenCalledWith('output of ls\n');
  });

  it('should reject queued commands if the shell is killed during abort', async () => {
    const session = new PersistentShellSession({
      sanitizationConfig: {
        allowedEnvironmentVariables: [],
        blockedEnvironmentVariables: [],
        enableEnvironmentVariableRedaction: false,
      },
    });

    const abortController1 = new AbortController();
    const p1 = session.execute(
      'sleep 10',
      process.cwd(),
      vi.fn(),
      abortController1.signal,
    );

    // Bootstrap
    await vi.waitFor(() => expect(mockPtyProcess.write).toHaveBeenCalled());
    const initMarker1 =
      mockPtyProcess.write.mock.calls[0][0].match(/INIT_[a-z0-9]+/)[0];
    mockPtyProcess.emit('data', `${initMarker1}\n`);

    // Command 1 write
    await vi.waitFor(() =>
      expect(mockPtyProcess.write).toHaveBeenCalledTimes(2),
    );

    // Now abort!
    abortController1.abort();

    // While it is aborting (waiting for the 1000ms timeout), queue another command
    const p2 = session.execute(
      'ls',
      process.cwd(),
      vi.fn(),
      new AbortController().signal,
    );

    // Fast-forward timeout
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // p1 should be aborted
    const res1 = await p1;
    expect(res1.aborted).toBe(true);

    // p2 should be REJECTED because kill() clears the queue
    await expect(p2).rejects.toThrow(
      'Persistent shell process was terminated.',
    );

    // Clean up p1 promise to avoid unhandled rejection if it were to reject (though it resolves in this test)
    await p1;
  });

  it('should reset sentOutputLength between commands even after abort', async () => {
    const session = new PersistentShellSession({
      sanitizationConfig: {
        allowedEnvironmentVariables: [],
        blockedEnvironmentVariables: [],
        enableEnvironmentVariableRedaction: false,
      },
    });

    const onOutputMock1 = vi.fn();
    const abortController1 = new AbortController();
    const p1 = session.execute(
      'ls',
      process.cwd(),
      onOutputMock1,
      abortController1.signal,
    );

    // Bootstrap
    await vi.waitFor(() => expect(mockPtyProcess.write).toHaveBeenCalled());
    const initMarker1 =
      mockPtyProcess.write.mock.calls[0][0].match(/INIT_[a-z0-9]+/)[0];
    mockPtyProcess.emit('data', `${initMarker1}\n`);

    // Cmd 1
    await vi.waitFor(() =>
      expect(mockPtyProcess.write).toHaveBeenCalledTimes(2),
    );
    const commandCall1 = mockPtyProcess.write.mock.calls[1][0];
    const startMarker1 = commandCall1
      .match(/"___GEMINI""(_START_MARKER_[a-z0-9]+___)"/)[0]
      .replace(/"/g, '')
      .replace(/___GEMINI/, '___GEMINI');

    // Send some output
    mockPtyProcess.emit(
      'data',
      `${startMarker1}\nLong output that is more than 10 characters\n`,
    );
    expect(onOutputMock1).toHaveBeenCalled();

    // Now ABORT
    abortController1.abort();
    await new Promise((resolve) => setTimeout(resolve, 1100)); // Wait for kill()
    await p1;

    // Now run command 2
    const onOutputMock2 = vi.fn();
    const p2 = session.execute(
      'ls',
      process.cwd(),
      onOutputMock2,
      new AbortController().signal,
    );

    // Bootstrap (new PTY because kill() was called)
    await vi.waitFor(() =>
      expect(mockPtyProcess.write).toHaveBeenCalledTimes(4),
    ); // SIGINT + Bootstrap 2
    const initMarker2 =
      mockPtyProcess.write.mock.calls[3][0].match(/INIT_[a-z0-9]+/)[0];
    mockPtyProcess.emit('data', `${initMarker2}\n`);

    // Cmd 2
    await vi.waitFor(() =>
      expect(mockPtyProcess.write).toHaveBeenCalledTimes(5),
    );
    const commandCall2 = mockPtyProcess.write.mock.calls[4][0];
    const startMarker2 = commandCall2
      .match(/"___GEMINI""(_START_MARKER_[a-z0-9]+___)"/)[0]
      .replace(/"/g, '')
      .replace(/___GEMINI/, '___GEMINI');

    // Send SHORT output
    mockPtyProcess.emit(
      'data',
      `${startMarker2}\nShort\n___GEMINI_EXIT_CODE_0___\n`,
    );
    const res2 = await p2;
    expect(res2.output).toBe('Short');

    // IF sentOutputLength was NOT reset, onOutputMock2 would NOT have been called!
    expect(onOutputMock2).toHaveBeenCalledWith('Short\n');
  });
});
