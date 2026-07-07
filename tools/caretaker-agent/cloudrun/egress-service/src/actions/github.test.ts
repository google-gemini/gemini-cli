/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCreateComment = vi.fn();
const mockAddLabels = vi.fn();
const mockRemoveLabel = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      issues: {
        createComment: mockCreateComment,
        addLabels: mockAddLabels,
        removeLabel: mockRemoveLabel,
      },
    },
  })),
}));

vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(),
}));

describe('GitHub Actions Handler', () => {
  let handleEgressEvent: (typeof import('./github.js'))['handleEgressEvent'];

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('GH_APP_ID', '12345');
    vi.stubEnv('GH_PRIVATE_KEY', 'test-key');
    vi.stubEnv('GH_INSTALLATION_ID', '67890');
    vi.stubEnv('ALLOWED_OWNER', 'google-gemini');
    vi.stubEnv('ALLOWED_REPO', 'gemini-cli');
    const mod = await import('./github.js');
    handleEgressEvent = mod.handleEgressEvent;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should throw an error for unauthorized repository target', async () => {
    await expect(
      handleEgressEvent({
        action: 'COMMENT',
        payload: {
          owner: 'unauthorized-org',
          repo: 'other-repo',
          issueNumber: 1,
          commentBody: 'hi',
        },
      }),
    ).rejects.toThrow(
      /Unauthorized repository target: unauthorized-org\/other-repo/,
    );
  });

  it('should throw an error if environment variables are missing', async () => {
    vi.stubEnv('GH_APP_ID', '');
    await expect(
      handleEgressEvent({
        action: 'COMMENT',
        payload: {
          owner: 'google-gemini',
          repo: 'gemini-cli',
          issueNumber: 1,
          commentBody: 'hi',
        },
      }),
    ).rejects.toThrow(/Missing required environment variable: GH_APP_ID/);
  });

  it('should throw an error if commentBody is empty or whitespace only', async () => {
    await expect(
      handleEgressEvent({
        action: 'COMMENT',
        payload: {
          owner: 'google-gemini',
          repo: 'gemini-cli',
          issueNumber: 1,
          commentBody: '   ',
        },
      }),
    ).rejects.toThrow(/Missing or empty commentBody/);
  });

  it('should call createComment for COMMENT action', async () => {
    mockCreateComment.mockResolvedValueOnce({});
    await handleEgressEvent({
      action: 'COMMENT',
      payload: {
        owner: 'google-gemini',
        repo: 'gemini-cli',
        issueNumber: 10,
        commentBody: 'Hello world',
      },
    });

    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: 'google-gemini',
      repo: 'gemini-cli',
      issue_number: 10,
      body: 'Hello world',
    });
  });

  it('should call addLabels for LABEL action', async () => {
    mockAddLabels.mockResolvedValueOnce({});
    await handleEgressEvent({
      action: 'LABEL',
      payload: {
        owner: 'google-gemini',
        repo: 'gemini-cli',
        issueNumber: 10,
        labels: ['effort/small'],
      },
    });

    expect(mockAddLabels).toHaveBeenCalledWith({
      owner: 'google-gemini',
      repo: 'gemini-cli',
      issue_number: 10,
      labels: ['effort/small'],
    });
  });

  it('should call removeLabel for UNLABEL action', async () => {
    mockRemoveLabel.mockResolvedValueOnce({});
    await handleEgressEvent({
      action: 'UNLABEL',
      payload: {
        owner: 'google-gemini',
        repo: 'gemini-cli',
        issueNumber: 10,
        labels: ['need-triage'],
      },
    });

    expect(mockRemoveLabel).toHaveBeenCalledWith({
      owner: 'google-gemini',
      repo: 'gemini-cli',
      issue_number: 10,
      name: 'need-triage',
    });
  });

  it('should throw an error for unsupported PATCH action', async () => {
    await expect(
      handleEgressEvent({
        action: 'PATCH',
        payload: {
          owner: 'google-gemini',
          repo: 'gemini-cli',
          issueNumber: 1,
        },
      }),
    ).rejects.toThrow(/PATCH action is not yet implemented/);
  });
});
