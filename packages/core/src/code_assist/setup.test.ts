/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupUser, ProjectIdRequiredError } from './setup.js';
import { CodeAssistServer } from '../code_assist/server.js';
import type { OAuth2Client } from 'google-auth-library';
import type { GeminiUserTier } from './types.js';
import { UserTierId } from './types.js';

vi.mock('../code_assist/server.js');

const mockPaidTier: GeminiUserTier = {
  id: UserTierId.STANDARD,
  name: 'paid',
  description: 'Paid tier',
  isDefault: true,
};

const mockFreeTier: GeminiUserTier = {
  id: UserTierId.FREE,
  name: 'free',
  description: 'Free tier',
  isDefault: true,
};

describe('setupUser for existing user', () => {
  let mockLoad: ReturnType<typeof vi.fn>;
  let mockOnboardUser: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockLoad = vi.fn();
    mockOnboardUser = vi.fn().mockResolvedValue({
      done: true,
      response: {
        cloudaicompanionProject: {
          id: 'server-project',
        },
      },
    });
    vi.mocked(CodeAssistServer).mockImplementation(
      () =>
        ({
          loadCodeAssist: mockLoad,
          onboardUser: mockOnboardUser,
        }) as unknown as CodeAssistServer,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should use GOOGLE_CLOUD_PROJECT when set and project from server is undefined', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project');
    mockLoad.mockResolvedValue({
      currentTier: mockPaidTier,
    });
    await setupUser({} as OAuth2Client);
    expect(CodeAssistServer).toHaveBeenCalledWith(
      {},
      'test-project',
      {},
      '',
      undefined,
    );
  });

  it('should ignore GOOGLE_CLOUD_PROJECT when project from server is set', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project');
    mockLoad.mockResolvedValue({
      cloudaicompanionProject: 'server-project',
      currentTier: mockPaidTier,
    });
    const projectId = await setupUser({} as OAuth2Client);
    expect(CodeAssistServer).toHaveBeenCalledWith(
      {},
      'test-project',
      {},
      '',
      undefined,
    );
    expect(projectId).toEqual({
      projectId: 'server-project',
      userTier: 'standard-tier',
    });
  });

  it('should throw ProjectIdRequiredError when no project ID is available', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
    // And the server itself requires a project ID internally
    vi.mocked(CodeAssistServer).mockImplementation(() => {
      throw new ProjectIdRequiredError();
    });

    await expect(setupUser({} as OAuth2Client)).rejects.toThrow(
      ProjectIdRequiredError,
    );
  });
});

describe('setupUser for new user', () => {
  let mockLoad: ReturnType<typeof vi.fn>;
  let mockOnboardUser: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockLoad = vi.fn();
    mockOnboardUser = vi.fn().mockResolvedValue({
      done: true,
      response: {
        cloudaicompanionProject: {
          id: 'server-project',
        },
      },
    });
    vi.mocked(CodeAssistServer).mockImplementation(
      () =>
        ({
          loadCodeAssist: mockLoad,
          onboardUser: mockOnboardUser,
        }) as unknown as CodeAssistServer,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should use GOOGLE_CLOUD_PROJECT when set and onboard a new paid user', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project');
    mockLoad.mockResolvedValue({
      allowedTiers: [mockPaidTier],
    });
    const userData = await setupUser({} as OAuth2Client);
    expect(CodeAssistServer).toHaveBeenCalledWith(
      {},
      'test-project',
      {},
      '',
      undefined,
    );
    expect(mockLoad).toHaveBeenCalled();
    expect(mockOnboardUser).toHaveBeenCalledWith({
      tierId: 'standard-tier',
      cloudaicompanionProject: 'test-project',
      metadata: {
        ideType: 'IDE_UNSPECIFIED',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI',
        duetProject: 'test-project',
      },
    });
    expect(userData).toEqual({
      projectId: 'server-project',
      userTier: 'standard-tier',
    });
  });

  it('should onboard a new free user when GOOGLE_CLOUD_PROJECT is not set', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
    mockLoad.mockResolvedValue({
      allowedTiers: [mockFreeTier],
    });
    const userData = await setupUser({} as OAuth2Client);
    expect(CodeAssistServer).toHaveBeenCalledWith(
      {},
      undefined,
      {},
      '',
      undefined,
    );
    expect(mockLoad).toHaveBeenCalled();
    expect(mockOnboardUser).toHaveBeenCalledWith({
      tierId: 'free-tier',
      cloudaicompanionProject: undefined,
      metadata: {
        ideType: 'IDE_UNSPECIFIED',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI',
      },
    });
    expect(userData).toEqual({
      projectId: 'server-project',
      userTier: 'free-tier',
    });
  });

  it('should use GOOGLE_CLOUD_PROJECT when onboard response has no project ID', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project');
    mockLoad.mockResolvedValue({
      allowedTiers: [mockPaidTier],
    });
    mockOnboardUser.mockResolvedValue({
      done: true,
      response: {
        cloudaicompanionProject: undefined,
      },
    });
    const userData = await setupUser({} as OAuth2Client);
    expect(userData).toEqual({
      projectId: 'test-project',
      userTier: 'standard-tier',
    });
  });

  it('should throw ProjectIdRequiredError when no project ID is available', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
    mockLoad.mockResolvedValue({
      allowedTiers: [mockPaidTier],
    });
    mockOnboardUser.mockResolvedValue({
      done: true,
      response: {},
    });
    await expect(setupUser({} as OAuth2Client)).rejects.toThrow(
      ProjectIdRequiredError,
    );
  });
});
