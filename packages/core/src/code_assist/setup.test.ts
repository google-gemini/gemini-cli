/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupUser, ProjectIdRequiredError } from './setup.js';
import { CodeAssistServer } from '../code_assist/server.js';
import { OAuth2Client } from 'google-auth-library';
import { GeminiUserTier, UserTierId } from './types.js';

vi.mock('../code_assist/server.js');

const mockPaidTier: GeminiUserTier = {
  id: UserTierId.STANDARD,
  name: 'paid',
  description: 'Paid tier',
};

describe('setupUser', () => {
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

  it('should use GOOGLE_CLOUD_PROJECT when set', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    mockLoad.mockResolvedValue({
      currentTier: mockPaidTier,
    });
    await setupUser({} as OAuth2Client);
    expect(CodeAssistServer).toHaveBeenCalledWith(
      expect.any(Object),
      'test-project',
    );
  });

  it('should treat empty GOOGLE_CLOUD_PROJECT as undefined and use project from server', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = '';
    mockLoad.mockResolvedValue({
      cloudaicompanionProject: 'server-project',
      currentTier: mockPaidTier,
    });
    const projectId = await setupUser({} as OAuth2Client);
    expect(CodeAssistServer).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
    );
    expect(projectId).toEqual({
      projectId: 'server-project',
      userTier: 'standard-tier',
    });
  });

  it('should throw ProjectIdRequiredError when no project ID is available', async () => {
    delete process.env.GOOGLE_CLOUD_PROJECT;
    // And the server itself requires a project ID internally
    vi.mocked(CodeAssistServer).mockImplementation(() => {
      throw new ProjectIdRequiredError();
    });

    await expect(setupUser({} as OAuth2Client)).rejects.toThrow(
      ProjectIdRequiredError,
    );
  });
});
