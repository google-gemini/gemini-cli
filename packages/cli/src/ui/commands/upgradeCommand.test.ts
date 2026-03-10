/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { upgradeCommand } from './upgradeCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import {
  AuthType,
  openBrowserSecurely,
  shouldLaunchBrowser,
  UPGRADE_URL_PAGE,
} from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    openBrowserSecurely: vi.fn(),
    shouldLaunchBrowser: vi.fn().mockReturnValue(true),
    UPGRADE_URL_PAGE: 'https://goo.gle/set-up-gemini-code-assist',
  };
});

describe('upgradeCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockCommandContext({
      services: {
        config: {
          getContentGeneratorConfig: vi.fn().mockReturnValue({
            authType: AuthType.LOGIN_WITH_GOOGLE,
          }),
        },
      },
    } as unknown as CommandContext);
  });

  it('should have the correct name and description', () => {
    expect(upgradeCommand.name).toBe('upgrade');
    expect(upgradeCommand.description).toBe(
      'Upgrade your Gemini Code Assist tier for higher limits',
    );
  });

  it('should call openBrowserSecurely with UPGRADE_URL_PAGE when logged in with Google', async () => {
    if (!upgradeCommand.action) {
      throw new Error('The upgrade command must have an action.');
    }

    await upgradeCommand.action(mockContext, '');

    expect(openBrowserSecurely).toHaveBeenCalledWith(UPGRADE_URL_PAGE);
  });

  it('should return an error message when NOT logged in with Google', async () => {
    vi.mocked(
      mockContext.services.config!.getContentGeneratorConfig,
    ).mockReturnValue({
      authType: AuthType.USE_GEMINI,
    });

    if (!upgradeCommand.action) {
      throw new Error('The upgrade command must have an action.');
    }

    const result = await upgradeCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        'The /upgrade command is only available when logged in with Google.',
    });
    expect(openBrowserSecurely).not.toHaveBeenCalled();
  });

  it('should return an error message if openBrowserSecurely fails', async () => {
    vi.mocked(openBrowserSecurely).mockRejectedValue(
      new Error('Failed to open'),
    );

    if (!upgradeCommand.action) {
      throw new Error('The upgrade command must have an action.');
    }

    const result = await upgradeCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Failed to open upgrade page: Failed to open',
    });
  });

  it('should return URL message when shouldLaunchBrowser returns false', async () => {
    vi.mocked(shouldLaunchBrowser).mockReturnValue(false);

    if (!upgradeCommand.action) {
      throw new Error('The upgrade command must have an action.');
    }

    const result = await upgradeCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: `Please open this URL in a browser: ${UPGRADE_URL_PAGE}`,
    });
    expect(openBrowserSecurely).not.toHaveBeenCalled();
  });
});
