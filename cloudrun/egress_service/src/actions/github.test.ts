/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleEgressEvent } from './github.js';
import { Octokit } from '@octokit/rest';

const mockCreateComment = vi.fn();
const mockAddLabels = vi.fn();

vi.mock('@octokit/rest', () => {
  return {
    Octokit: vi.fn().mockImplementation(() => ({
      rest: {
        issues: {
          createComment: mockCreateComment,
          addLabels: mockAddLabels,
        },
      },
    })),
  };
});

vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(),
}));

describe('GitHub Actions Handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      GH_APP_ID: '12345',
      GH_PRIVATE_KEY: 'test-key',
      GH_INSTALLATION_ID: '67890',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw an error if environment variables are missing', async () => {
    delete process.env.GH_APP_ID;
    await expect(
      handleEgressEvent({
        action: 'COMMENT',
        payload: { owner: 'o', repo: 'r', issueNumber: 1, commentBody: 'hi' },
      }),
    ).rejects.toThrow(/Missing required environment variable: GH_APP_ID/);
  });

  it('should call createComment for COMMENT action', async () => {
    mockCreateComment.mockResolvedValueOnce({});
    await handleEgressEvent({
      action: 'COMMENT',
      payload: {
        owner: 'google',
        repo: 'cli',
        issueNumber: 10,
        commentBody: 'Hello world',
      },
    });

    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: 'google',
      repo: 'cli',
      issue_number: 10,
      body: 'Hello world',
    });
  });

  it('should call addLabels for LABEL action', async () => {
    mockAddLabels.mockResolvedValueOnce({});
    await handleEgressEvent({
      action: 'LABEL',
      payload: {
        owner: 'google',
        repo: 'cli',
        issueNumber: 10,
        labels: ['effort/small'],
      },
    });

    expect(mockAddLabels).toHaveBeenCalledWith({
      owner: 'google',
      repo: 'cli',
      issue_number: 10,
      labels: ['effort/small'],
    });
  });
});
