/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performInitialAuth } from './auth.js';
import {
  type Config,
  ValidationRequiredError,
  ProjectIdRequiredError,
  AuthType,
} from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
  };
});

describe('auth', () => {
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      refreshAuth: vi.fn(),
    } as unknown as Config;
  });

  it('should return null if authType is undefined', async () => {
    const result = await performInitialAuth(mockConfig, undefined);
    expect(result).toEqual({ authError: null, accountSuspensionInfo: null });
    expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
  });

  it('should return null on successful auth', async () => {
    const result = await performInitialAuth(
      mockConfig,
      AuthType.LOGIN_WITH_GOOGLE,
    );
    expect(result).toEqual({ authError: null, accountSuspensionInfo: null });
    expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
      AuthType.LOGIN_WITH_GOOGLE,
    );
  });

  it('should return error message on failed auth', async () => {
    const error = new Error('Authentication failed');
    vi.mocked(mockConfig.refreshAuth).mockRejectedValue(error);
    const result = await performInitialAuth(
      mockConfig,
      AuthType.LOGIN_WITH_GOOGLE,
    );
    expect(result).toEqual({
      authError: 'Failed to sign in. Message: Authentication failed',
      accountSuspensionInfo: null,
    });
    expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
      AuthType.LOGIN_WITH_GOOGLE,
    );
  });

  it('should return null if refreshAuth throws ValidationRequiredError', async () => {
    vi.mocked(mockConfig.refreshAuth).mockRejectedValue(
      new ValidationRequiredError('Validation required'),
    );
    const result = await performInitialAuth(
      mockConfig,
      AuthType.LOGIN_WITH_GOOGLE,
    );
    expect(result).toEqual({ authError: null, accountSuspensionInfo: null });
    expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
      AuthType.LOGIN_WITH_GOOGLE,
    );
  });

  it('should return accountSuspensionInfo for 403 TOS_VIOLATION error', async () => {
    vi.mocked(mockConfig.refreshAuth).mockRejectedValue({
      response: {
        data: {
          error: {
            code: 403,
            message:
              'This service has been disabled for violation of Terms of Service.',
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                reason: 'TOS_VIOLATION',
                domain: 'example.googleapis.com',
                metadata: {
                  appeal_url: 'https://example.com/appeal',
                  appeal_url_link_text: 'Appeal Here',
                },
              },
            ],
          },
        },
      },
    });
    const result = await performInitialAuth(
      mockConfig,
      AuthType.LOGIN_WITH_GOOGLE,
    );
    expect(result).toEqual({
      authError: null,
      accountSuspensionInfo: {
        message:
          'This service has been disabled for violation of Terms of Service.',
        appealUrl: 'https://example.com/appeal',
        appealLinkText: 'Appeal Here',
      },
    });
    expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
      AuthType.LOGIN_WITH_GOOGLE,
    );
  });

  it('should return ProjectIdRequiredError message without "Failed to login" prefix', async () => {
    const projectIdError = new ProjectIdRequiredError();
    vi.mocked(mockConfig.refreshAuth).mockRejectedValue(projectIdError);
    const result = await performInitialAuth(
      mockConfig,
      AuthType.LOGIN_WITH_GOOGLE,
    );
    expect(result).toEqual({
      authError:
        'This account requires setting the GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID env var. See https://goo.gle/gemini-cli-auth-docs#workspace-gca',
      accountSuspensionInfo: null,
    });
    expect(result.authError).not.toContain('Failed to login');
    expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
      AuthType.LOGIN_WITH_GOOGLE,
    );
  });
});
