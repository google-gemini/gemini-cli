/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionPersistence } from './useSessionPersistence.js';
import * as fs from 'fs';
import * as path from 'path';
import process from 'node:process';
import { MessageType, HistoryItem } from '../types.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// Mock process.on and process.off for exit event
let mockProcessOn: Mock;
let mockProcessOff: Mock;

describe('useSessionPersistence', () => {
  let mockHistory: HistoryItem[];
  let mockLoadHistory: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    mockHistory = [];
    mockLoadHistory = vi.fn();

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('');
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

    mockProcessOn = vi.spyOn(process, 'on');
    mockProcessOff = vi.spyOn(process, 'off');
    mockProcessOn.mockClear();
    mockProcessOff.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should register and unregister exit handler', () => {
    const { unmount } = renderHook(() =>
      useSessionPersistence({
        sessionPersistence: true,
        history: mockHistory,
        loadHistory: mockLoadHistory,
      }),
    );

    expect(mockProcessOn).toHaveBeenCalledWith('exit', expect.any(Function));

    unmount();

    expect(mockProcessOff).toHaveBeenCalledWith('exit', expect.any(Function));
  });

  it('should save session history on exit when persistence is enabled', async () => {
    const { unmount } = renderHook(() =>
      useSessionPersistence({
        sessionPersistence: true,
        history: mockHistory,
        loadHistory: mockLoadHistory,
      }),
    );

    mockHistory.push(
      { type: MessageType.USER, text: 'User message 1' },
      { type: MessageType.GEMINI, text: 'Gemini response 1' },
      { type: MessageType.INFO, text: 'Info message' }, // Should be filtered
    );

    // Manually trigger the exit handler
    const exitHandler = mockProcessOn.mock.calls.find(
      (call) => call[0] === 'exit',
    )?.[1];

    expect(exitHandler).toBeDefined();

    await act(async () => {
      exitHandler();
    });

    const expectedPath = path.join(process.cwd(), '.gemini', 'session.json');
    const expectedContent = JSON.stringify(
      [
        { type: MessageType.USER, text: 'User message 1' },
        { type: MessageType.GEMINI, text: 'Gemini response 1' },
      ],
      null,
      2,
    );

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      path.join(process.cwd(), '.gemini'),
      { recursive: true },
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expectedPath,
      expectedContent,
    );

    unmount();
  });

  it('should load session history on startup when persistence is enabled and file exists', async () => {
    const savedHistory = [
      { type: MessageType.USER, text: 'Loaded user message' },
      { type: MessageType.GEMINI, text: 'Loaded gemini response' },
    ];

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedHistory));

    const { unmount } = renderHook(() =>
      useSessionPersistence({
        sessionPersistence: true,
        history: mockHistory,
        loadHistory: mockLoadHistory,
      }),
    );

    await vi.runAllTimersAsync(); // Flush effects

    expect(fs.existsSync).toHaveBeenCalledWith(
      path.join(process.cwd(), '.gemini', 'session.json'),
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(
      path.join(process.cwd(), '.gemini', 'session.json'),
      'utf-8',
    );
    expect(mockLoadHistory).toHaveBeenCalledWith(savedHistory);

    unmount();
  });

  it('should not save or load session history when persistence is disabled', async () => {
    const { unmount } = renderHook(() =>
      useSessionPersistence({
        sessionPersistence: false,
        history: mockHistory,
        loadHistory: mockLoadHistory,
      }),
    );

    await vi.runAllTimersAsync(); // Flush effects

    expect(fs.existsSync).not.toHaveBeenCalled();
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(mockProcessOn).not.toHaveBeenCalledWith(
      'exit',
      expect.any(Function),
    );

    unmount();
  });

  it('should log error if loading fails', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Read error');
    });

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { unmount } = renderHook(() =>
      useSessionPersistence({
        sessionPersistence: true,
        history: mockHistory,
        loadHistory: mockLoadHistory,
      }),
    );

    await vi.runAllTimersAsync(); // Flush effects

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error loading session history:',
      expect.any(Error),
    );
    expect(mockLoadHistory).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    unmount();
  });

  it('should log error if saving fails', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false); // Ensure mkdirSync is called
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('Write error');
    });

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { unmount } = renderHook(() =>
      useSessionPersistence({
        sessionPersistence: true,
        history: mockHistory,
        loadHistory: mockLoadHistory,
      }),
    );

    mockHistory.push({ type: MessageType.USER, text: 'User message' });

    const exitHandler = mockProcessOn.mock.calls.find(
      (call) => call[0] === 'exit',
    )?.[1];

    expect(exitHandler).toBeDefined();
    exitHandler();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error saving session history:',
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
    unmount();
  });
});
