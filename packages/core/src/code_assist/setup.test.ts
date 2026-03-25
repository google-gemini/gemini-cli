/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProjectIdRequiredError,
  setupUser,
  ValidationCancelledError,
  resetUserDataCacheForTesting,
} from './setup.js';
import { ValidationRequiredError } from '../utils/googleQuotaErrors.js';
import { CodeAssistServer } from '../code_assist/server.js';
import type { OAuth2Client } from 'google-auth-library';
import { UserTierId, type GeminiUserTier } from './types.js';
import type { Config } from '../config/config.js';
import {
  logOnboardingSuccess,
  OnboardingSuccessEvent,
} from '../telemetry/index.js';

vi.mock('../code_assist/server.js');
vi.mock('../telemetry/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../telemetry/index.js')>();
  return {
    ...actual,
    logOnboardingStart: vi.fn(),
    logOnboardingSuccess: vi.fn(),
  };
});

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

describe('setupUser', () => {
  let mockLoad: ReturnType<typeof vi.fn>;
  let mockOnboardUser: ReturnType<typeof vi.fn>;
  let mockGetOperation: ReturnType<typeof vi.fn>;
  let mockConfig: Config;
  let mockValidationHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    resetUserDataCacheForTesting();
    vi.useFakeTimers();

    mockLoad = vi.fn();
    mockOnboardUser = vi.fn().mockResolvedValue({
      done: true,
      response: {
        cloudaicompanionProject: {
          id: 'server-project',
        },
      },
    });
    mockGetOperation = vi.fn();

    vi.mocked(CodeAssistServer).mockImplementation(
      () =>
        ({
          loadCodeAssist: mockLoad,
          onboardUser: mockOnboardUser,
          getOperation: mockGetOperation,
        }) as unknown as CodeAssistServer,
    );

    mockValidationHandler = vi.fn();
    mockConfig = {
      getValidationHandler: () => mockValidationHandler,
      getUsageStatisticsEnabled: () => true,
      getSessionId: () => 'test-session-id',
      getContentGeneratorConfig: () => ({
        authType: 'google-login',
      }),
      isInteractive: () => false,
      getExperiments: () => undefined,
    } as unknown as Config;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe('caching', () => {
    it('should cache setup result for same client and projectId', async () => {
      mockLoad.mockResolvedValue({
        currentTier: mockPaidTier,
        cloudaicompanionProject: 'server-project',
      });

      const client = {} as OAuth2Client;
      // First call
      await setupUser(client, mockConfig);
      // Second call
      await setupUser(client, mockConfig);

      expect(mockLoad).toHaveBeenCalledTimes(1);
    });

    it('should re-fetch if projectId changes', async () => {
      mockLoad.mockResolvedValue({
        currentTier: mockPaidTier,
        cloudaicompanionProject: 'server-project',
      });

      const client = {} as OAuth2Client;
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'p1');
      await setupUser(client, mockConfig);

      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'p2');
      await setupUser(client, mockConfig);

      expect(mockLoad).toHaveBeenCalledTimes(2);
    });

    it('should re-fetch if cache expires', async () => {
      mockLoad.mockResolvedValue({
        currentTier: mockPaidTier,
        cloudaicompanionProject: 'server-project',
      });

      const client = {} as OAuth2Client;
      await setupUser(client, mockConfig);

      vi.advanceTimersByTime(31000); // 31s > 30s expiration

      await setupUser(client, mockConfig);

      expect(mockLoad).toHaveBeenCalledTimes(2);
    });

    it('should retry if previous attempt failed', async () => {
      mockLoad.mockRejectedValueOnce(new Error('Network error'));
      mockLoad.mockResolvedValueOnce({
        currentTier: mockPaidTier,
        cloudaicompanionProject: 'server-project',
      });

      const client = {} as OAuth2Client;
      await expect(setupUser(client, mockConfig)).rejects.toThrow(
        'Network error',
      );
      await setupUser(client, mockConfig);

      expect(mockLoad).toHaveBeenCalledTimes(2);
    });
  });

  describe('existing user', () => {
    it('should use GOOGLE_CLOUD_PROJECT when set and project from server is undefined', async () => {
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project');
      mockLoad.mockResolvedValue({
        currentTier: mockPaidTier,
      });
      await setupUser({} as OAuth2Client, mockConfig);
      expect(CodeAssistServer).toHaveBeenCalledWith(
        {},
        'test-project',
        {},
        '',
        undefined,
        undefined,
      );
    });

    it('should pass httpOptions to CodeAssistServer when provided', async () => {
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project');
      mockLoad.mockResolvedValue({
        currentTier: mockPaidTier,
      });
      const httpOptions = {
        headers: {
          'User-Agent': 'GeminiCLI/1.0.0/gemini-2.0-flash (darwin; arm64)',
        },
      };
      await setupUser({} as OAuth2Client, mockConfig, httpOptions);
      expect(CodeAssistServer).toHaveBeenCalledWith(
        {},
        'test-project',
        httpOptions,
        '',
        undefined,
        undefined,
      );
    });

    it('should ignore GOOGLE_CLOUD_PROJECT when project from server is set', async () => {
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project');
      mockLoad.mockResolvedValue({
        cloudaicompanionProject: 'server-project',
        currentTier: mockPaidTier,
      });
      const result = await setupUser({} as OAuth2Client, mockConfig);
      expect(result.projectId).toBe('server-project');
    });

    it('should throw ProjectIdRequiredError when no project ID is available', async () => {
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
      // And the server itself requires a project ID internally
      vi.mocked(CodeAssistServer).mockImplementation(() => {
        throw new ProjectIdRequiredError();
      });

      await expect(setupUser({} as OAuth2Client, mockConfig)).rejects.toThrow(
        ProjectIdRequiredError,
      );
    });
  });

  describe('new user', () => {
    it('should onboard a new paid user with GOOGLE_CLOUD_PROJECT', async () => {
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project');
      mockLoad.mockResolvedValue({
        allowedTiers: [mockPaidTier],
      });
      mockOnboardUser.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return {
          done: true,
          response: {
            cloudaicompanionProject: {
              id: 'server-project',
            },
          },
        };
      });
      const userDataPromise = setupUser({} as OAuth2Client, mockConfig);
      await vi.advanceTimersByTimeAsync(1500);
      const userData = await userDataPromise;
      expect(mockOnboardUser).toHaveBeenCalledWith(
        expect.objectContaining({
          tierId: UserTierId.STANDARD,
          cloudaicompanionProject: 'test-project',
        }),
      );
      expect(userData).toEqual({
        projectId: 'server-project',
        userTier: UserTierId.STANDARD,
        userTierName: 'paid',
        hasOnboardedPreviously: false,
      });
      expect(logOnboardingSuccess).toHaveBeenCalledWith(
        mockConfig,
        expect.any(OnboardingSuccessEvent),
      );
      const event = vi.mocked(logOnboardingSuccess).mock.calls[0][1];
      expect(event.userTier).toBe('paid');
      expect(event.duration_ms).toBeGreaterThanOrEqual(1500);
    });

    it('should onboard a new free user when project ID is not set', async () => {
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
      mockLoad.mockResolvedValue({
        allowedTiers: [mockFreeTier],
      });
      const userData = await setupUser({} as OAuth2Client, mockConfig);
      expect(mockOnboardUser).toHaveBeenCalledWith(
        expect.objectContaining({
          tierId: UserTierId.FREE,
          cloudaicompanionProject: undefined,
        }),
      );
      expect(userData).toEqual({
        projectId: 'server-project',
        userTier: UserTierId.FREE,
        userTierName: 'free',
        hasOnboardedPreviously: false,
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
      const userData = await setupUser({} as OAuth2Client, mockConfig);
      expect(userData).toEqual({
        projectId: 'test-project',
        userTier: UserTierId.STANDARD,
        userTierName: 'paid',
        hasOnboardedPreviously: false,
      });
    });

    it('should poll getOperation when onboardUser returns done=false', async () => {
      mockLoad.mockResolvedValue({
        allowedTiers: [mockPaidTier],
      });

      const operationName = 'operations/123';

      mockOnboardUser.mockResolvedValueOnce({
        name: operationName,
        done: false,
      });

      mockGetOperation
        .mockResolvedValueOnce({
          name: operationName,
          done: false,
        })
        .mockResolvedValueOnce({
          name: operationName,
          done: true,
          response: {
            cloudaicompanionProject: {
              id: 'server-project',
            },
          },
        });

      const promise = setupUser({} as OAuth2Client, mockConfig);

      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);

      const userData = await promise;

      expect(mockGetOperation).toHaveBeenCalledWith(operationName);
      expect(userData.projectId).toBe('server-project');
    });
  });

  describe('validation and errors', () => {
    it('should retry if validation handler returns verify', async () => {
      mockLoad
        .mockResolvedValueOnce({
          currentTier: null,
          ineligibleTiers: [
            {
              reasonMessage: 'Verify please',
              reasonCode: 'VALIDATION_REQUIRED',
              tierId: UserTierId.STANDARD,
              tierName: 'standard',
              validationUrl: 'https://verify',
            },
          ],
        })
        .mockResolvedValueOnce({
          currentTier: mockPaidTier,
          cloudaicompanionProject: 'p1',
        });

      mockValidationHandler.mockResolvedValue('verify');
      const result = await setupUser({} as OAuth2Client, mockConfig);

      expect(mockValidationHandler).toHaveBeenCalledWith(
        'https://verify',
        'Verify please',
      );
      expect(mockLoad).toHaveBeenCalledTimes(2);
      expect(result.projectId).toBe('p1');
    });

    it('should throw ValidationCancelledError if handler returns cancel', async () => {
      mockLoad.mockResolvedValue({
        currentTier: null,
        ineligibleTiers: [
          {
            reasonMessage: 'User is not eligible',
            reasonCode: 'VALIDATION_REQUIRED',
            tierId: UserTierId.STANDARD,
            tierName: 'standard',
            validationUrl: 'https://example.com/verify',
          },
        ],
      });

      mockValidationHandler.mockResolvedValue('cancel');

      await expect(setupUser({} as OAuth2Client, mockConfig)).rejects.toThrow(
        ValidationCancelledError,
      );
    });

    it('should throw error if LoadCodeAssist returns empty response', async () => {
      mockLoad.mockResolvedValue(null);

      await expect(setupUser({} as OAuth2Client, mockConfig)).rejects.toThrow(
        'LoadCodeAssist returned empty response',
      );
    });
  });
});

describe('ValidationRequiredError', () => {
  const error = new ValidationRequiredError(
    'Account validation required: Please verify',
    undefined,
    'https://example.com/verify',
    'Please verify',
  );

  it('should be an instance of Error', () => {
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationRequiredError);
  });

  it('should have the correct properties', () => {
    expect(error.validationLink).toBe('https://example.com/verify');
    expect(error.validationDescription).toBe('Please verify');
  });
});
