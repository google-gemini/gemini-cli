/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { initializeApp } from './initializer.js';
import {
  logCliConfiguration,
  IdeClient,
  logIdeConnection,
  IdeConnectionType,
  type Config,
} from '@google/gemini-cli-core';
import { performInitialAuth } from './auth.js';
import { validateTheme } from './theme.js';
import type { LoadedSettings } from '../config/settings.js';

// Mock dependencies
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    logCliConfiguration: vi.fn(),
    logIdeConnection: vi.fn(),
    IdeClient: {
      getInstance: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
      })),
    },
    StartSessionEvent: vi.fn().mockImplementation((config, toolRegistry) => ({
      config,
      toolRegistry,
    })),
    IdeConnectionEvent: vi.fn().mockImplementation((type) => ({
      type,
    })),
  };
});

vi.mock('./auth.js', () => ({
  performInitialAuth: vi.fn(),
}));

vi.mock('./theme.js', () => ({
  validateTheme: vi.fn(),
}));

describe('initializeApp', () => {
  let mockConfig: Config;
  let mockSettings: LoadedSettings;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getIdeMode: vi.fn().mockReturnValue(false),
      getGeminiMdFileCount: vi.fn().mockReturnValue(5),
      getToolRegistry: vi.fn().mockReturnValue('mockToolRegistry'),
    } as unknown as Config;
    mockSettings = {
      merged: {
        security: {
          auth: {
            selectedType: 'google',
          },
        },
      },
    } as unknown as LoadedSettings;
  });

  it('should call performInitialAuth and validateTheme', async () => {
    (performInitialAuth as Mock).mockResolvedValue('auth-error');
    (validateTheme as Mock).mockReturnValue('theme-error');

    const result = await initializeApp(mockConfig, mockSettings);

    expect(performInitialAuth).toHaveBeenCalledWith(mockConfig, 'google');
    expect(validateTheme).toHaveBeenCalledWith(mockSettings);
    expect(result).toEqual({
      authError: 'auth-error',
      themeError: 'theme-error',
      shouldOpenAuthDialog: true,
      geminiMdFileCount: 5,
    });
  });

  it('should log StartSessionEvent', async () => {
    await initializeApp(mockConfig, mockSettings);

    expect(logCliConfiguration).toHaveBeenCalledTimes(1);
    // Check that it was called with a StartSessionEvent (mocked above)
    const eventArg = (logCliConfiguration as Mock).mock.calls[0][1];
    expect(eventArg.config).toBe(mockConfig);
    expect(eventArg.toolRegistry).toBe('mockToolRegistry');
  });

  it('should handle IDE mode and log IdeConnectionEvent', async () => {
    (mockConfig.getIdeMode as Mock).mockReturnValue(true);
    const mockConnect = vi.fn().mockResolvedValue(undefined);
    (IdeClient.getInstance as Mock).mockReturnValue({ connect: mockConnect });

    await initializeApp(mockConfig, mockSettings);

    expect(IdeClient.getInstance).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(logIdeConnection).toHaveBeenCalledTimes(1);

    const eventArg = (logIdeConnection as Mock).mock.calls[0][1];
    expect(eventArg.type).toBe(IdeConnectionType.START);
  });
});
