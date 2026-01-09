/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { aboutCommand } from './aboutCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { IdeClient, getVersion, AuthType } from '@google/gemini-cli-core';

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
    getVersion: vi.fn(),
  };
});

describe('aboutCommand', () => {
  let mockContext: CommandContext;
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockContext = createMockCommandContext({
      services: {
        config: {
          getModel: vi.fn(),
          getIdeMode: vi.fn().mockReturnValue(true),
          getContentGeneratorConfig: vi.fn().mockReturnValue({
            authType: AuthType.LOGIN_WITH_GOOGLE,
          }),
        },
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

    vi.mocked(getVersion).mockResolvedValue('test-version');
    vi.spyOn(mockContext.services.config!, 'getModel').mockReturnValue(
      'test-model',
    );
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

  describe('Auth fallback status display', () => {
    it('should show Gemini API Key fallback when active auth is USE_GEMINI and selected is google', async () => {
      mockContext = createMockCommandContext({
        services: {
          config: {
            getModel: vi.fn().mockReturnValue('test-model'),
            getContentGeneratorConfig: vi.fn().mockReturnValue({
              authType: AuthType.USE_GEMINI,
            }),
            getIdeMode: vi.fn().mockReturnValue(false),
          },
          settings: {
            merged: {
              security: {
                auth: {
                  selectedType: AuthType.LOGIN_WITH_GOOGLE,
                },
              },
            },
          },
        },
        ui: {
          addItem: vi.fn(),
        },
      } as unknown as CommandContext);

      process.env['SANDBOX'] = '';
      if (!aboutCommand.action) {
        throw new Error('The about command must have an action.');
      }

      await aboutCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedAuthType:
            'OAuth (fallback: Gemini API Key) -> active this session',
        }),
        expect.any(Number),
      );
    });

    it('should show Vertex AI fallback when active auth is USE_VERTEX_AI and selected is google', async () => {
      mockContext = createMockCommandContext({
        services: {
          config: {
            getModel: vi.fn().mockReturnValue('test-model'),
            getContentGeneratorConfig: vi.fn().mockReturnValue({
              authType: AuthType.USE_VERTEX_AI,
            }),
            getIdeMode: vi.fn().mockReturnValue(false),
          },
          settings: {
            merged: {
              security: {
                auth: {
                  selectedType: AuthType.LOGIN_WITH_GOOGLE,
                },
              },
            },
          },
        },
        ui: {
          addItem: vi.fn(),
        },
      } as unknown as CommandContext);

      process.env['SANDBOX'] = '';
      if (!aboutCommand.action) {
        throw new Error('The about command must have an action.');
      }

      await aboutCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedAuthType:
            'OAuth (fallback: Vertex AI) -> active this session',
        }),
        expect.any(Number),
      );
    });

    it('should show normal auth type when not in fallback mode', async () => {
      mockContext = createMockCommandContext({
        services: {
          config: {
            getModel: vi.fn().mockReturnValue('test-model'),
            getContentGeneratorConfig: vi.fn().mockReturnValue({
              authType: AuthType.LOGIN_WITH_GOOGLE,
            }),
            getIdeMode: vi.fn().mockReturnValue(false),
          },
          settings: {
            merged: {
              security: {
                auth: {
                  selectedType: AuthType.LOGIN_WITH_GOOGLE,
                },
              },
            },
          },
        },
        ui: {
          addItem: vi.fn(),
        },
      } as unknown as CommandContext);

      process.env['SANDBOX'] = '';
      if (!aboutCommand.action) {
        throw new Error('The about command must have an action.');
      }

      await aboutCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedAuthType: AuthType.LOGIN_WITH_GOOGLE,
        }),
        expect.any(Number),
      );
    });

    it('should not show fallback status when selected auth is not google', async () => {
      mockContext = createMockCommandContext({
        services: {
          config: {
            getModel: vi.fn().mockReturnValue('test-model'),
            getContentGeneratorConfig: vi.fn().mockReturnValue({
              authType: AuthType.USE_GEMINI,
            }),
            getIdeMode: vi.fn().mockReturnValue(false),
          },
          settings: {
            merged: {
              security: {
                auth: {
                  selectedType: 'gemini-api-key',
                },
              },
            },
          },
        },
        ui: {
          addItem: vi.fn(),
        },
      } as unknown as CommandContext);

      process.env['SANDBOX'] = '';
      if (!aboutCommand.action) {
        throw new Error('The about command must have an action.');
      }

      await aboutCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedAuthType: 'gemini-api-key',
        }),
        expect.any(Number),
      );
    });
  });
});
