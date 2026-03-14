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
import {
  IdeClient,
  getVersion,
  getCodeAssistServer,
  type CodeAssistServer,
} from '@google/gemini-cli-core';

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
    getCodeAssistServer: vi.fn(),
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
          getUserTierName: vi.fn().mockReturnValue(undefined),
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

    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.ABOUT,
      cliVersion: 'test-version',
      osVersion: 'test-os',
      sandboxEnv: 'no sandbox',
      modelVersion: 'test-model',
      selectedAuthType: 'test-auth',
      gcpProject: 'test-gcp-project',
      ideClient: 'test-ide',
      userEmail: 'test-email@example.com',
      tier: undefined,
    });
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
    );
  });

  it('should display the tier when getUserTierName returns a value', async () => {
    vi.mocked(mockContext.services.config!.getUserTierName).mockReturnValue(
      'Enterprise Tier',
    );
    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'Enterprise Tier',
      }),
    );
  });

  it('should prefer GCP project from Code Assist server over env var', async () => {
    vi.mocked(getCodeAssistServer).mockReturnValue({
      projectId: 'ca-server-project',
    } as CodeAssistServer);
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'env-project');

    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        gcpProject: 'ca-server-project',
      }),
    );
  });

  it('should fall back to env var when Code Assist server has no project', async () => {
    vi.mocked(getCodeAssistServer).mockReturnValue(undefined);
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'env-project');

    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        gcpProject: 'env-project',
      }),
    );
  });

  it('should return empty string when no GCP project available', async () => {
    vi.mocked(getCodeAssistServer).mockReturnValue(undefined);
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');

    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        gcpProject: '',
      }),
    );
  });
});
