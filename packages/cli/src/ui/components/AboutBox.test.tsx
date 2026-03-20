/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { AboutBox, maskEmail, maskGcpProject } from './AboutBox.js';
import { describe, it, expect, vi } from 'vitest';

// Mock GIT_COMMIT_INFO
vi.mock('../../generated/git-commit.js', () => ({
  GIT_COMMIT_INFO: 'mock-commit-hash',
}));

describe('maskEmail', () => {
  it('masks the local part of a standard email', () => {
    expect(maskEmail('john.doe@company.com')).toBe('j***@company.com');
  });

  it('masks a single-char local part', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });

  it('returns *** for invalid email without @', () => {
    expect(maskEmail('no-at-sign')).toBe('***');
  });

  it('returns *** for email starting with @', () => {
    expect(maskEmail('@example.com')).toBe('***');
  });
});

describe('maskGcpProject', () => {
  it('masks a standard project ID', () => {
    expect(maskGcpProject('my-prod-project-123456')).toBe('***3456');
  });

  it('masks a short project (more than 4 chars)', () => {
    expect(maskGcpProject('abcde')).toBe('***bcde');
  });

  it('returns *** for very short project (4 or fewer chars)', () => {
    expect(maskGcpProject('abcd')).toBe('***');
    expect(maskGcpProject('ab')).toBe('***');
  });
});

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
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
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
    expect(output).toContain('Signed in with Google');
    unmount();
  });

  it.each([
    ['gcpProject', 'my-project', 'GCP Project', '***ject'],
    ['ideClient', 'vscode', 'IDE Client', 'vscode'],
    ['tier', 'Enterprise', 'Tier', 'Enterprise'],
  ])(
    'renders optional prop %s',
    async (prop, value, label, expectedDisplay) => {
      const props = { ...defaultProps, [prop]: value };
      const { lastFrame, waitUntilReady, unmount } =
        await renderWithProviders(<AboutBox {...props} />);
      await waitUntilReady();
      const output = lastFrame();
      expect(output).toContain(label);
      expect(output).toContain(expectedDisplay);
      unmount();
    },
  );

  it('renders Auth Method with masked email when userEmail is provided', async () => {
    const props = { ...defaultProps, userEmail: 'test@example.com' };
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <AboutBox {...props} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Signed in with Google (t***@example.com)');
    expect(output).not.toContain('test@example.com');
    unmount();
  });

  it('renders Auth Method correctly when not oauth', async () => {
    const props = { ...defaultProps, selectedAuthType: 'api-key' };
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <AboutBox {...props} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('api-key');
    unmount();
  });
});
