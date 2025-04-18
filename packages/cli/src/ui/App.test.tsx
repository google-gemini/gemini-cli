// packages/cli/src/ui/App.test.tsx
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import App from './App.js';
import { useInputHistory } from './hooks/useInputHistory.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { StreamingState } from '../core/gemini-stream.js';
import type { HistoryItem } from './types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initializeConfig } from '../config/globalConfig.js';

// --- Mocks ---

// Mock the useGeminiStream hook
vi.mock('./hooks/useGeminiStream.js', () => ({
  useGeminiStream: vi.fn(),
}));

// Mock the useInputHistory hook
vi.mock('./hooks/useInputHistory.js', () => ({
  useInputHistory: vi.fn(),
}));

// Mock fs/path/os used for warnings check
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));
vi.mock('path', async (importOriginal) => {
  const originalPath = await importOriginal<typeof import('path')>();
  return {
    ...originalPath,
    default: originalPath,
    join: originalPath.join,
    resolve: originalPath.resolve,
    relative: originalPath.relative,
  };
});
vi.mock('os', async (importOriginal) => {
  const originalOs = await importOriginal<typeof import('os')>();
  return {
    ...originalOs,
    default: originalOs,
    tmpdir: vi.fn().mockReturnValue('/tmp'),
  };
});

// --- Test Suite ---
describe('App Component Rendering', () => {
  // Define mock return values for the hooks
  let mockSetQuery: ReturnType<typeof vi.fn>;
  let mockResetHistoryNav: ReturnType<typeof vi.fn>;
  let mockSubmitQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    // Initialize global config
    initializeConfig({ model: 'test-model-v1' });

    // Setup mock return values for hooks
    mockSetQuery = vi.fn();
    mockResetHistoryNav = vi.fn();
    mockSubmitQuery = vi.fn().mockResolvedValue(undefined);

    (useInputHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      query: '',
      setQuery: mockSetQuery,
      resetHistoryNav: mockResetHistoryNav,
      inputKey: 0,
    });

    (useGeminiStream as ReturnType<typeof vi.fn>).mockReturnValue({
      streamingState: StreamingState.Idle,
      submitQuery: mockSubmitQuery,
      initError: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  // Helper function to render App
  const renderApp = (initialHookQuery = '') => {
    (useInputHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      query: initialHookQuery,
      setQuery: mockSetQuery,
      resetHistoryNav: mockResetHistoryNav,
      inputKey: 0,
    });

    return render(<App directory="/test/dir" />);
  };

  // --- Tests ---
  test('should render initial placeholder with model', () => {
    const { lastFrame } = renderApp();
    expect(lastFrame()).toContain('Ask Gemini (test-model-v1)');
  });

  test('should pass query from useInputHistory to InputPrompt', () => {
    const { lastFrame } = renderApp('test query from hook');
    expect(lastFrame()).toContain('> test query from hook');
  });

  // Add more tests here for App's behavior, like:
  // - Displaying startup warnings when the mocked fs.existsSync returns true
  // - Displaying initError from useGeminiStream when it's not null
  // - Ensuring handleInputSubmit calls the correct functions from the hooks
});
