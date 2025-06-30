/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GetActiveApplicationInfoTool } from './get-active-application-info';
import * as child_process from 'child_process';

// Mock child_process
vi.mock('child_process');

describe('GetActiveApplicationInfoTool', () => {
  let tool: GetActiveApplicationInfoTool;
  let mockSpawn: any;
  let mockProcess: any;

  beforeEach(() => {
    tool = new GetActiveApplicationInfoTool();
    mockProcess = {
      stdout: { on: vi.fn(), removeAllListeners: vi.fn() },
      stderr: { on: vi.fn(), removeAllListeners: vi.fn() },
      on: vi.fn(),
      removeAllListeners: vi.fn(),
      kill: vi.fn(),
    };
    mockSpawn = vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should correctly initialize', () => {
    expect(tool.name).toBe('getActiveApplicationInfo');
    expect(tool.description).toContain('Windows-specific');
    expect(tool.schema.parameters).toEqual({}); // No parameters
  });

  it('should throw an error if not on Windows', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });

    await expect(tool.execute({}, new AbortController().signal)).rejects.toThrow(
      'GetActiveApplicationInfoTool is only supported on Windows.',
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform }); // Restore platform
  });

  it('should execute and parse valid JSON output on Windows', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

    const mockOutput = {
      pid: 1234,
      title: 'Test Window',
      executablePath: 'C:\\test\\app.exe',
    };
    const expectedLlmContent = `Active application: Test Window (PID: 1234, Path: C:\\test\\app.exe)`;
    const expectedReturnDisplay = `Active Window:\nTitle: Test Window\nPID: 1234\nExecutable Path: C:\\test\\app.exe`;

    // Simulate successful process execution
    mockProcess.on.mockImplementation((event: string, callback: Function) => {
      if (event === 'close') {
        // Simulate stdout data before close
        mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1](JSON.stringify(mockOutput));
        callback(0); // Success code
      }
      return mockProcess;
    });

    const result = await tool.execute({}, new AbortController().signal);

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.stringContaining('ActiveWindowInfo.exe'),
      [],
      expect.any(Object),
    );
    expect(result.pid).toBe(mockOutput.pid);
    expect(result.title).toBe(mockOutput.title);
    expect(result.executablePath).toBe(mockOutput.executablePath);
    expect(result.llmContent).toBe(expectedLlmContent);
    expect(result.returnDisplay).toBe(expectedReturnDisplay);

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should handle JSON parsing errors', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

    // Simulate process with invalid JSON output
    mockProcess.on.mockImplementation((event: string, callback: Function) => {
      if (event === 'close') {
        mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1]('invalid json');
        callback(0); // Success code, but bad output
      }
      return mockProcess;
    });

    await expect(tool.execute({}, new AbortController().signal)).rejects.toThrow(
      /Error parsing JSON output: Unexpected token i in JSON at position 0\nOutput: invalid json/,
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should handle process error (e.g., non-zero exit code)', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

    // Simulate process error
    mockProcess.on.mockImplementation((event: string, callback: Function) => {
      if (event === 'close') {
        mockProcess.stderr.on.mock.calls.find((call: any) => call[0] === 'data')?.[1]('Some error');
        callback(1); // Error code
      }
      return mockProcess;
    });

    await expect(tool.execute({}, new AbortController().signal)).rejects.toThrow(
      'ActiveWindowInfo.exe exited with code 1: Some error',
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

   it('should handle spawn error (e.g., file not found)', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

    mockSpawn.mockImplementation(() => {
      // Simulate the 'error' event being emitted by the spawned process object
      const fakeProcess = {
        stdout: { on: vi.fn(), removeAllListeners: vi.fn() },
        stderr: { on: vi.fn(), removeAllListeners: vi.fn() },
        on: (event: string, cb: (err?: Error) => void) => {
          if (event === 'error') {
            cb(new Error('ENOENT: spawn EACCES'));
          }
        },
        removeAllListeners: vi.fn(),
        kill: vi.fn(),
      };
      // Ensure the 'on' method is chainable or returns the object
      fakeProcess.on = fakeProcess.on.bind(fakeProcess);
      return fakeProcess as any;
    });


    await expect(tool.execute({}, new AbortController().signal)).rejects.toThrow(
      /Failed to start ActiveWindowInfo.exe: ENOENT: spawn EACCES. Ensure the utility is compiled and at the correct path: .*ActiveWindowInfo.exe/,
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should be aborted if signal is aborted', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    const controller = new AbortController();

    mockProcess.on.mockImplementation((event: string, callback: Function) => {
      if (event === 'close') {
        // Simulate abortion before close is called
        controller.abort();
        callback(0); // Success code
      }
      return mockProcess;
    });

    await expect(tool.execute({}, controller.signal)).rejects.toThrow(
        'Tool execution was aborted.'
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('validateToolParams should return null as there are no params', () => {
    expect(tool.validateToolParams({})).toBeNull();
  });

  it('getDescription should return the correct description string', () => {
    expect(tool.getDescription({})).toBe('Gets information about the currently active application window on Windows.');
  });

});
