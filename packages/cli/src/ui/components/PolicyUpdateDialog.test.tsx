/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { PolicyUpdateDialog } from './PolicyUpdateDialog.js';
import {
  type Config,
  type PolicyUpdateConfirmationRequest,
  PolicyIntegrityManager,
} from '@google/gemini-cli-core';

const { mockAcceptIntegrity } = vi.hoisted(() => ({
  mockAcceptIntegrity: vi.fn(),
}));

// Mock PolicyIntegrityManager
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    PolicyIntegrityManager: vi.fn().mockImplementation(() => ({
      acceptIntegrity: mockAcceptIntegrity,
      checkIntegrity: vi.fn(),
    })),
  };
});

describe('PolicyUpdateDialog', () => {
  let mockConfig: Config;
  let mockRequest: PolicyUpdateConfirmationRequest;
  let onClose: () => void;

  beforeEach(() => {
    mockConfig = {
      loadWorkspacePolicies: vi.fn().mockResolvedValue(undefined),
    } as unknown as Config;

    mockRequest = {
      scope: 'workspace',
      identifier: '/test/workspace/.gemini/policies',
      policyDir: '/test/workspace/.gemini/policies',
      newHash: 'test-hash',
    } as PolicyUpdateConfirmationRequest;

    onClose = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and matches snapshot', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <PolicyUpdateDialog
        config={mockConfig}
        request={mockRequest}
        onClose={onClose}
      />,
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    expect(output).toContain('New or changed workspace policies detected');
    expect(output).toContain('Location: /test/workspace/.gemini/policies');
    expect(output).toContain('Accept and Load');
    expect(output).toContain('Ignore');
  });

  it('handles ACCEPT correctly', async () => {
    const { stdin } = renderWithProviders(
      <PolicyUpdateDialog
        config={mockConfig}
        request={mockRequest}
        onClose={onClose}
      />,
    );

    // Accept is the first option, so pressing enter should select it
    await act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(PolicyIntegrityManager).toHaveBeenCalled();
      expect(mockConfig.loadWorkspacePolicies).toHaveBeenCalledWith(
        mockRequest.policyDir,
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('handles IGNORE correctly', async () => {
    const { stdin } = renderWithProviders(
      <PolicyUpdateDialog
        config={mockConfig}
        request={mockRequest}
        onClose={onClose}
      />,
    );

    // Move down to Ignore option
    await act(async () => {
      stdin.write('\x1B[B'); // Down arrow
    });
    await act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      expect(PolicyIntegrityManager).not.toHaveBeenCalled();
      expect(mockConfig.loadWorkspacePolicies).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('calls onClose when Escape key is pressed', async () => {
    const { stdin } = renderWithProviders(
      <PolicyUpdateDialog
        config={mockConfig}
        request={mockRequest}
        onClose={onClose}
      />,
    );

    await act(async () => {
      stdin.write('\x1B'); // Escape key (matches Command.ESCAPE default)
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
