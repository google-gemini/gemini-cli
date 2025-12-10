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
import {
  persistentState,
  type PersistentStateData,
} from '../utils/persistentState.js';

vi.mock('../code_assist/server.js');
vi.mock('../utils/persistentState.js', () => ({
  persistentState: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

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

describe('setupUser with caching', () => {
  let mockLoad: ReturnType<typeof vi.fn>;
  let mockOnboardUser: ReturnType<typeof vi.fn>;
  // unused variables mockCacheDir, mockCacheFile removed to satisfy lint

  beforeEach(() => {
    vi.resetAllMocks();
    mockLoad = vi.fn();
    mockOnboardUser = vi.fn();

    vi.mocked(persistentState.get).mockReturnValue(undefined); // Default no cache

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

  it('should return cached data if valid cache exists', async () => {
    const cachedData = {
      projectId: 'cached-project',
      userTier: UserTierId.STANDARD,
      timestamp: Date.now(),
    };
    vi.mocked(persistentState.get).mockReturnValue(cachedData);

    const result = await setupUser({} as OAuth2Client);

    expect(result).toEqual({
      projectId: 'cached-project',
      userTier: UserTierId.STANDARD,
    });
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('should ignore expired cache', async () => {
    const cachedData = {
      projectId: 'cached-project',
      userTier: UserTierId.STANDARD,
      timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
    };
    vi.mocked(persistentState.get).mockReturnValue(cachedData);

    // Mock server response
    mockLoad.mockResolvedValue({
      currentTier: mockPaidTier,
      cloudaicompanionProject: 'server-project',
    });

    const result = await setupUser({} as OAuth2Client);

    expect(result).toEqual({
      projectId: 'server-project',
      userTier: 'standard-tier',
    });
    expect(mockLoad).toHaveBeenCalled();
  });

  it('should write to cache after successful fetch', async () => {
    vi.mocked(persistentState.get).mockReturnValue(undefined);
    mockLoad.mockResolvedValue({
      currentTier: mockPaidTier,
      cloudaicompanionProject: 'server-project',
    });

    await setupUser({} as OAuth2Client);

    expect(persistentState.set).toHaveBeenCalled();
    const args = vi.mocked(persistentState.set).mock.calls[0];
    expect(args[0]).toBe('userTierCache');
    const content = args[1] as PersistentStateData['userTierCache'];
    expect(content).toMatchObject({
      projectId: 'server-project',
      userTier: 'standard-tier',
    });
  });
});

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
