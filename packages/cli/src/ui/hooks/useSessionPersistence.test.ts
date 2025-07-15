/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSessionPersistence } from './useSessionPersistence.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import process from 'node:process';
import { MessageType, HistoryItem } from '../types.js';

// Spy on process.on/off to capture the exit handler
let mockProcessOn: Mock;
let mockProcessOff: Mock;

describe('useSessionPersistence - Integration Test', () => {
  let mockHistory: HistoryItem[];
  let mockLoadHistory: Mock;
  let tempDir = '';
  let originalCwd = '';

  beforeEach(() => {
    // Store original CWD and create a temp directory
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-test-'));
    process.chdir(tempDir);

    mockHistory = [];
    mockLoadHistory = vi.fn();

    // Spy on process.on/off
    mockProcessOn = vi.spyOn(process, 'on');
    mockProcessOff = vi.spyOn(process, 'off');
  });

  afterEach(() => {
    // Restore CWD and clean up the temp directory
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Restore mocks
    vi.restoreAllMocks();
  });

  it('should not create any files or register handlers if persistence is disabled', () => {
    renderHook(() =>
      useSessionPersistence({
        sessionPersistence: false,
        history: mockHistory,
        loadHistory: mockLoadHistory,
      }),
    );

    const geminiDir = path.join(tempDir, '.gemini');
    expect(fs.existsSync(geminiDir)).toBe(false);
    expect(mockProcessOn).not.toHaveBeenCalled();
  });

  it('should save session history on exit when persistence is enabled', () => {
    const { unmount } = renderHook(() =>
      useSessionPersistence({
        sessionPersistence: true,
        history: mockHistory,
        loadHistory: mockLoadHistory,
      }),
    );

    // Find the registered exit handler
    const exitHandler = mockProcessOn.mock.calls.find(
      (call) => call[0] === 'exit',
    )?.[1];
    expect(exitHandler).toBeDefined();

    // Add items to history
    mockHistory.push(
      { id: 1, type: MessageType.USER, text: 'User message 1' },
      { id: 2, type: MessageType.GEMINI, text: 'Gemini response 1' },
      { id: 3, type: MessageType.INFO, text: 'Info message' }, // Should be filtered
    );

    // Manually trigger the exit handler to save the session
    exitHandler();

    const sessionPath = path.join(tempDir, '.gemini', 'session.json');
    expect(fs.existsSync(sessionPath)).toBe(true);

    const savedData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    const expectedData = [
      { type: MessageType.USER, text: 'User message 1' },
      { type: MessageType.GEMINI, text: 'Gemini response 1' },
    ];

    expect(savedData).toEqual(expectedData);

    // Ensure the handler is unregistered on unmount
    unmount();
    expect(mockProcessOff).toHaveBeenCalledWith('exit', exitHandler);
  });

  it('should load session history on startup if file exists', async () => {
    const geminiDir = path.join(tempDir, '.gemini');
    fs.mkdirSync(geminiDir, { recursive: true });

    const sessionPath = path.join(geminiDir, 'session.json');
    const savedHistory = [
      { type: MessageType.USER, text: 'Loaded user message' },
      { type: MessageType.GEMINI, text: 'Loaded gemini response' },
    ];
    fs.writeFileSync(sessionPath, JSON.stringify(savedHistory));

    renderHook(() =>
      useSessionPersistence({
        sessionPersistence: true,
        history: mockHistory,
        loadHistory: mockLoadHistory,
      }),
    );

    // The hook loads asynchronously, so we wait for the loadHistory mock to be called
    await waitFor(() => {
      expect(mockLoadHistory).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: MessageType.USER,
            text: 'Loaded user message',
            id: expect.any(Number),
          }),
          expect.objectContaining({
            type: MessageType.GEMINI,
            text: 'Loaded gemini response',
            id: expect.any(Number),
          }),
        ]),
      );

      const loadedItems = mockLoadHistory.mock.calls[0][0];
      loadedItems.forEach((item: HistoryItem) => {
        expect(item.id).toBeLessThan(0);
      });
    });
  });

  it('should not throw or call loadHistory if session file is empty or corrupt', async () => {
    const geminiDir = path.join(tempDir, '.gemini');
    fs.mkdirSync(geminiDir, { recursive: true });
    const sessionPath = path.join(geminiDir, 'session.json');
    fs.writeFileSync(sessionPath, 'corrupt data');

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    renderHook(() =>
      useSessionPersistence({
        sessionPersistence: true,
        history: mockHistory,
        loadHistory: mockLoadHistory,
      }),
    );

    // Wait for the async load to finish
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error loading session history:',
        expect.any(Error),
      );
    });

    expect(mockLoadHistory).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should not call loadHistory if session file contains valid JSON but not an array', async () => {
    const geminiDir = path.join(tempDir, '.gemini');
    fs.mkdirSync(geminiDir, { recursive: true });
    const sessionPath = path.join(geminiDir, 'session.json');
    fs.writeFileSync(sessionPath, '{"key": "value"}'); // Valid JSON, but not an array

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    renderHook(() =>
      useSessionPersistence({
        sessionPersistence: true,
        history: mockHistory,
        loadHistory: mockLoadHistory,
      }),
    );

    // Give async operations a chance to run
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockLoadHistory).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled(); // No error should be logged for this case
    consoleErrorSpy.mockRestore();
  });

  it('should not throw or call loadHistory if session file does not exist', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    renderHook(() =>
      useSessionPersistence({
        sessionPersistence: true,
        history: mockHistory,
        loadHistory: mockLoadHistory,
      }),
    );

    // Give async operations a chance to run, though none should happen
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockLoadHistory).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
