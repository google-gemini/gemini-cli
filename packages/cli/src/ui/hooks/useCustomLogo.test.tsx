/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { useCustomLogo } from './useCustomLogo.js';
import * as fs from 'node:fs/promises';
import toml from '@iarna/toml';

vi.mock('node:fs/promises');
vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    warn: vi.fn(),
  },
  getErrorMessage: (e: unknown) => String(e),
}));

const TestComponent = ({ path }: { path: string | undefined }) => {
  const variants = useCustomLogo(path);
  return <Text>{variants ? JSON.stringify(variants) : 'undefined'}</Text>;
};

describe('useCustomLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when no path is provided', () => {
    const { lastFrame } = render(<TestComponent path={undefined} />);
    expect(lastFrame()).toBe('undefined');
  });

  it('loads and parses a valid TOML file', async () => {
    const mockVariants = {
      longAsciiLogo: 'LONG LOGO',
      shortAsciiLogo: 'SHORT LOGO',
    };
    const tomlContent = toml.stringify(mockVariants);
    vi.mocked(fs.readFile).mockResolvedValue(tomlContent);

    const { lastFrame, rerender } = render(
      <TestComponent path="/path/to/logo.toml" />,
    );

    expect(lastFrame()).toBe('undefined');

    await new Promise((resolve) => setTimeout(resolve, 0));
    rerender(<TestComponent path="/path/to/logo.toml" />);

    expect(lastFrame()).toBe(JSON.stringify(mockVariants));
    expect(fs.readFile).toHaveBeenCalledWith('/path/to/logo.toml', 'utf-8');
  });

  it('handles file read errors gracefully', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

    const { lastFrame, rerender } = render(
      <TestComponent path="/invalid/path.toml" />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    rerender(<TestComponent path="/invalid/path.toml" />);

    expect(lastFrame()).toBe('undefined');
    expect(fs.readFile).toHaveBeenCalledWith('/invalid/path.toml', 'utf-8');
  });

  it('handles TOML parse errors gracefully', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('INVALID TOML [');

    const { lastFrame, rerender } = render(
      <TestComponent path="/path/to/bad.toml" />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    rerender(<TestComponent path="/path/to/bad.toml" />);

    expect(lastFrame()).toBe('undefined');
  });
});
