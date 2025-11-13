/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  afterEach,
  type Mock,
} from 'vitest';
import { aboutCommand } from './aboutCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import * as versionUtils from '../../utils/version.js';
import { MessageType } from '../types.js';
import { AuthType, IdeClient } from '@google/gemini-cli-core';

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
  };
});

vi.mock('../../utils/version.js', () => ({
  getCliVersion: vi.fn(),
}));

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
          getAutoFallback: vi.fn().mockReturnValue({
            enabled: false,
            type: 'gemini-api-key',
          }),
          getContentGeneratorConfig: vi.fn().mockReturnValue({
            authType: 'test-auth',
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

    vi.mocked(versionUtils.getCliVersion).mockResolvedValue('test-version');
    vi.spyOn(mockContext.services.config!, 'getModel').mockReturnValue(
      'test-model',
    );
    process.env['GOOGLE_CLOUD_PROJECT'] = 'test-gcp-project';
    Object.defineProperty(process, 'platform', {
      value: 'test-os',
    });
  });

  it('should display fallback auth information when configured', async () => {
    process.env['SANDBOX'] = '';
    mockContext.services.config = {
      getModel: vi.fn().mockReturnValue('test-model'),
      getIdeMode: vi.fn().mockReturnValue(false),
      getAutoFallback: vi.fn().mockReturnValue({
        enabled: true,
        type: 'vertex-ai',
      }),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: AuthType.USE_VERTEX_AI,
      }),
    } as unknown as CommandContext['services']['config'];

    mockContext.services.settings.merged.security = {
      auth: {
        selectedType: AuthType.LOGIN_WITH_GOOGLE,
      },
    } as typeof mockContext.services.settings.merged.security;

    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    const callArgs = (mockContext.ui.addItem as Mock).mock.calls[0][0];
    expect(callArgs.selectedAuthType).toBe(
      'OAuth | auto fallback → Vertex AI (active this session)',
    );
  });

  it('should NOT display fallback info when persisted auth is not OAuth', async () => {
    process.env['SANDBOX'] = '';
    mockContext.services.config = {
      getModel: vi.fn().mockReturnValue('test-model'),
      getIdeMode: vi.fn().mockReturnValue(false),
      getAutoFallback: vi.fn().mockReturnValue({
        enabled: true,
        type: 'vertex-ai',
      }),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: AuthType.USE_GEMINI,
      }),
    } as unknown as CommandContext['services']['config'];

    mockContext.services.settings.merged.security = {
      auth: {
        selectedType: AuthType.USE_GEMINI,
      },
    } as typeof mockContext.services.settings.merged.security;

    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    const callArgs = (mockContext.ui.addItem as Mock).mock.calls[0][0];
    // Should only show the persisted auth type, not fallback info
    expect(callArgs.selectedAuthType).toBe('Gemini API Key');
  });

  it('should display session-only auth change when different from selected type', async () => {
    process.env['SANDBOX'] = '';
    mockContext.services.config = {
      getModel: vi.fn().mockReturnValue('test-model'),
      getIdeMode: vi.fn().mockReturnValue(false),
      getAutoFallback: vi.fn().mockReturnValue({
        enabled: false,
        type: 'vertex-ai',
      }),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: AuthType.USE_GEMINI,
      }),
    } as unknown as CommandContext['services']['config'];

    mockContext.services.settings.merged.security = {
      auth: {
        selectedType: AuthType.LOGIN_WITH_GOOGLE,
      },
    } as typeof mockContext.services.settings.merged.security;

    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    const callArgs = (mockContext.ui.addItem as Mock).mock.calls[0][0];
    expect(callArgs.selectedAuthType).toBe('OAuth | session → Gemini API Key');
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
});
