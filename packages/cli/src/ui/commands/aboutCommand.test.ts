/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { aboutCommand } from './aboutCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import * as versionUtils from '../../utils/version.js';
import { MessageType } from '../types.js';
import { IdeClient, AuthType } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    IdeClient: {
      getInstance: vi.fn().mockResolvedValue({
        getDetectedIdeDisplayName: vi.fn().mockReturnValue('test-ide'),
      }),
    },
    UserAccountManager: vi.fn().mockImplementation(() => ({
      getCachedGoogleAccount: vi.fn().mockReturnValue('test-email@example.com'),
    })),
  };
});

vi.mock('../../utils/version.js', () => ({
  getCliVersion: vi.fn(),
}));

describe('aboutCommand', () => {
  let mockContext: CommandContext;
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  const createConfigMock = (
    overrides: Partial<CommandContext['services']['config']> = {},
  ): CommandContext['services']['config'] => {
    const baseConfig = {
      getModel: vi.fn().mockReturnValue('test-model'),
      getIdeMode: vi.fn().mockReturnValue(true),
      getAutoFallback: vi.fn().mockReturnValue({
        enabled: false,
        type: 'gemini-api-key',
      }),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: 'test-auth',
      }),
    } as unknown as CommandContext['services']['config'];

    return {
      ...baseConfig,
      ...overrides,
    } as CommandContext['services']['config'];
  };

  beforeEach(() => {
    mockContext = createMockCommandContext({
      services: {
        config: createConfigMock(),
        settings: {
          merged: {
            security: {
              auth: {
                selectedType: 'test-auth',
              },
            },
          },
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext);

    vi.mocked(versionUtils.getCliVersion).mockResolvedValue('test-version');

    process.env['GOOGLE_CLOUD_PROJECT'] = 'test-gcp-project';
    Object.defineProperty(process, 'platform', {
      value: 'test-os',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should have the correct name and description', () => {
    expect(aboutCommand.name).toBe('about');
    expect(aboutCommand.description).toBe('Show version info');
  });

  it('should call addItem with all version info', async () => {
    process.env['SANDBOX'] = '';
    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.ABOUT,
        cliVersion: 'test-version',
        osVersion: 'test-os',
        sandboxEnv: 'no sandbox',
        modelVersion: 'test-model',
        selectedAuthType: 'test-auth',
        gcpProject: 'test-gcp-project',
        ideClient: 'test-ide',
        userEmail: 'test-email@example.com',
      },
      expect.any(Number),
    );
  });

  it('should show the correct sandbox environment variable', async () => {
    process.env['SANDBOX'] = 'gemini-sandbox';
    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxEnv: 'gemini-sandbox',
      }),
      expect.any(Number),
    );
  });

  it('should show sandbox-exec profile when applicable', async () => {
    process.env['SANDBOX'] = 'sandbox-exec';
    process.env['SEATBELT_PROFILE'] = 'test-profile';
    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxEnv: 'sandbox-exec (test-profile)',
      }),
      expect.any(Number),
    );
  });

  it('should not show ide client when it is not detected', async () => {
    vi.mocked(IdeClient.getInstance).mockResolvedValue({
      getDetectedIdeDisplayName: vi.fn().mockReturnValue(undefined),
    } as unknown as IdeClient);

    process.env['SANDBOX'] = '';
    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ABOUT,
        cliVersion: 'test-version',
        osVersion: 'test-os',
        sandboxEnv: 'no sandbox',
        modelVersion: 'test-model',
        selectedAuthType: 'test-auth',
        gcpProject: 'test-gcp-project',
        ideClient: '',
      }),
      expect.any(Number),
    );
  });

  describe('auth display', () => {
    const setSelectedAuthType = (selected: AuthType) => {
      mockContext.services.settings.merged.security = {
        auth: {
          selectedType: selected,
        },
      } as typeof mockContext.services.settings.merged.security;
    };

    it('should show only settings auth when auto-fallback is disabled and session matches', async () => {
      setSelectedAuthType(AuthType.LOGIN_WITH_GOOGLE);
      mockContext.services.config = createConfigMock({
        getContentGeneratorConfig: vi.fn().mockReturnValue({
          authType: AuthType.LOGIN_WITH_GOOGLE,
        }),
        getAutoFallback: vi.fn().mockReturnValue({
          enabled: false,
          type: 'gemini-api-key',
        }),
      });

      if (!aboutCommand.action) {
        throw new Error('The about command must have an action.');
      }
      await aboutCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedAuthType: 'OAuth',
        }),
        expect.any(Number),
      );
    });

    it('should show fallback type when auto-fallback is enabled', async () => {
      setSelectedAuthType(AuthType.LOGIN_WITH_GOOGLE);
      mockContext.services.config = createConfigMock({
        getContentGeneratorConfig: vi.fn().mockReturnValue({
          authType: AuthType.LOGIN_WITH_GOOGLE,
        }),
        getAutoFallback: vi.fn().mockReturnValue({
          enabled: true,
          type: 'gemini-api-key',
        }),
      });

      if (!aboutCommand.action) {
        throw new Error('The about command must have an action.');
      }
      await aboutCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedAuthType: 'OAuth (fallback: Gemini API Key)',
        }),
        expect.any(Number),
      );
    });

    it('should show fallback active when auto-fallback is enabled and active', async () => {
      setSelectedAuthType(AuthType.LOGIN_WITH_GOOGLE);
      mockContext.services.config = createConfigMock({
        getContentGeneratorConfig: vi.fn().mockReturnValue({
          authType: AuthType.USE_GEMINI,
        }),
        getAutoFallback: vi.fn().mockReturnValue({
          enabled: true,
          type: 'gemini-api-key',
        }),
      });

      if (!aboutCommand.action) {
        throw new Error('The about command must have an action.');
      }
      await aboutCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedAuthType:
            'OAuth (fallback: Gemini API Key) → active this session',
        }),
        expect.any(Number),
      );
    });

    it('should show session override when differing without auto-fallback', async () => {
      setSelectedAuthType(AuthType.LOGIN_WITH_GOOGLE);
      mockContext.services.config = createConfigMock({
        getContentGeneratorConfig: vi.fn().mockReturnValue({
          authType: AuthType.USE_VERTEX_AI,
        }),
        getAutoFallback: vi.fn().mockReturnValue({
          enabled: false,
          type: 'gemini-api-key',
        }),
      });

      if (!aboutCommand.action) {
        throw new Error('The about command must have an action.');
      }
      await aboutCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedAuthType: 'OAuth → session: Vertex AI',
        }),
        expect.any(Number),
      );
    });
  });
});
