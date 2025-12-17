/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
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

  it('renders with required props', () => {
    const { lastFrame } = render(<AboutBox {...defaultProps} />);
    const output = lastFrame();
    expect(output).toContain('About Gemini CLI');
    expect(output).toContain('1.0.0');
    expect(output).toContain('mock-commit-hash');
    expect(output).toContain('gemini-pro');
    expect(output).toContain('default');
    expect(output).toContain('macOS');
    expect(output).toContain('OAuth');
  });

  it.each([
    ['userEmail', 'test@example.com', 'User Email'],
    ['gcpProject', 'my-project', 'GCP Project'],
    ['ideClient', 'vscode', 'IDE Client'],
  ])('renders optional prop %s', (prop, value, label) => {
    const props = { ...defaultProps, [prop]: value };
    const { lastFrame } = render(<AboutBox {...props} />);
    const output = lastFrame();
    expect(output).toContain(label);
    expect(output).toContain(value);
  });

  it('renders Auth Method correctly when not oauth', () => {
    const props = { ...defaultProps, selectedAuthType: 'api-key' };
    const { lastFrame } = render(<AboutBox {...props} />);
    const output = lastFrame();
    expect(output).toContain('api-key');
  });
});
