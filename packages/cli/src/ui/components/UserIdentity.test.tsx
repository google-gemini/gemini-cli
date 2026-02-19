/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { UserIdentity } from './UserIdentity.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  makeFakeConfig,
  AuthType,
  UserAccountManager,
  type ContentGeneratorConfig,
} from '@google/gemini-cli-core';

// Mock UserAccountManager to control cached account
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    UserAccountManager: vi.fn().mockImplementation(() => ({
      getCachedGoogleAccount: () => 'test@example.com',
    })),
  };
});

describe('<UserIdentity />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render login message and auth indicator', async () => {
    const mockConfig = makeFakeConfig();
    vi.spyOn(mockConfig, 'getContentGeneratorConfig').mockReturnValue({
      authType: AuthType.LOGIN_WITH_GOOGLE,
      model: 'gemini-pro',
    } as unknown as ContentGeneratorConfig);
    vi.spyOn(mockConfig, 'getUserTierName').mockReturnValue(undefined);

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <UserIdentity config={mockConfig} />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain('Logged in with Google: test@example.com');
    expect(output).toContain('/auth');
    unmount();
  });

  it('should render login message without colon if email is missing', async () => {
    // Modify the mock for this specific test
    vi.mocked(UserAccountManager).mockImplementationOnce(
      () =>
        ({
          getCachedGoogleAccount: () => undefined,
        }) as unknown as UserAccountManager,
    );

    const mockConfig = makeFakeConfig();
    vi.spyOn(mockConfig, 'getContentGeneratorConfig').mockReturnValue({
      authType: AuthType.LOGIN_WITH_GOOGLE,
      model: 'gemini-pro',
    } as unknown as ContentGeneratorConfig);
    vi.spyOn(mockConfig, 'getUserTierName').mockReturnValue(undefined);

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <UserIdentity config={mockConfig} />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain('Logged in with Google');
    expect(output).not.toContain('Logged in with Google:');
    expect(output).toContain('/auth');
    unmount();
  });

  it('should render plan name on a separate line if provided', async () => {
    const mockConfig = makeFakeConfig();
    vi.spyOn(mockConfig, 'getContentGeneratorConfig').mockReturnValue({
      authType: AuthType.LOGIN_WITH_GOOGLE,
      model: 'gemini-pro',
    } as unknown as ContentGeneratorConfig);
    vi.spyOn(mockConfig, 'getUserTierName').mockReturnValue('Premium Plan');

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <UserIdentity config={mockConfig} />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain('Logged in with Google: test@example.com');
    expect(output).toContain('/auth');
    expect(output).toContain('Plan: Premium Plan');

    // Check for two lines (or more if wrapped, but here it should be separate)
    const lines = output?.split('\n').filter((line) => line.trim().length > 0);
    expect(lines?.some((line) => line.includes('Logged in with Google'))).toBe(
      true,
    );
    expect(lines?.some((line) => line.includes('Plan: Premium Plan'))).toBe(
      true,
    );

    unmount();
  });

  it('should not render if authType is missing', async () => {
    const mockConfig = makeFakeConfig();
    vi.spyOn(mockConfig, 'getContentGeneratorConfig').mockReturnValue(
      {} as unknown as ContentGeneratorConfig,
    );

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <UserIdentity config={mockConfig} />,
    );
    await waitUntilReady();

    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('should render non-Google auth message', async () => {
    const mockConfig = makeFakeConfig();
    vi.spyOn(mockConfig, 'getContentGeneratorConfig').mockReturnValue({
      authType: AuthType.USE_GEMINI,
      model: 'gemini-pro',
    } as unknown as ContentGeneratorConfig);
    vi.spyOn(mockConfig, 'getUserTierName').mockReturnValue(undefined);

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <UserIdentity config={mockConfig} />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain(`Authenticated with ${AuthType.USE_GEMINI}`);
    expect(output).toContain('/auth');
    unmount();
  });
});
