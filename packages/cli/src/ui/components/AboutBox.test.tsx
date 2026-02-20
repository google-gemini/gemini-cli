/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { AboutBox } from './AboutBox.js';
import { describe, it, expect, vi } from 'vitest';

// Mock GIT_COMMIT_INFO
vi.mock('../../generated/git-commit.js', () => ({
  GIT_COMMIT_INFO: 'mock-commit-hash',
}));

describe('AboutBox', () => {
  const defaultProps = {
    cliVersion: '1.0.0',
    osVersion: 'macOS',
    sandboxEnv: 'default',
    modelVersion: 'gemini-pro',
    selectedAuthType: 'oauth',
    gcpProject: '',
    ideClient: '',
  };

  it('renders with required props', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <AboutBox {...defaultProps} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('About Gemini CLI');
    expect(output).toContain('1.0.0');
    expect(output).toContain('mock-commit-hash');
    expect(output).toContain('gemini-pro');
    expect(output).toContain('default');
    expect(output).toContain('macOS');
    expect(output).toContain('Logged in with Google');
    unmount();
  });

  it.each([
    ['gcpProject', 'my-project', 'GCP Project'],
    ['ideClient', 'vscode', 'IDE Client'],
    ['tier', 'Enterprise', 'Tier'],
  ])('renders optional prop %s', async (prop, value, label) => {
    const props = { ...defaultProps, [prop]: value };
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <AboutBox {...props} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain(label);
    expect(output).toContain(value);
    unmount();
  });

  it('renders Auth Method with email when userEmail is provided', async () => {
    const props = { ...defaultProps, userEmail: 'test@example.com' };
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <AboutBox {...props} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Logged in with Google (test@example.com)');
    unmount();
  });

  it('renders Auth Method correctly when not oauth', async () => {
    const props = { ...defaultProps, selectedAuthType: 'api-key' };
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <AboutBox {...props} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('api-key');
    unmount();
  });
});
