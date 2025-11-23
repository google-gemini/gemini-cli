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

  it('loads and parses a valid JSON file', async () => {
    const mockVariants = {
      longAsciiLogo: 'LONG LOGO',
      shortAsciiLogo: 'SHORT LOGO',
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockVariants));

    const { lastFrame, rerender } = render(
      <TestComponent path="/path/to/logo.json" />,
    );

    // Initial state should be undefined
    expect(lastFrame()).toBe('undefined');

    // Wait for async update - we can't easily wait for hook state update in ink-testing-library
    // without polling or using timers. Since fs.readFile is mocked to resolve immediately,
    // we just need to wait for the promise queue to drain.
    await new Promise((resolve) => setTimeout(resolve, 0));
    rerender(<TestComponent path="/path/to/logo.json" />);

    expect(lastFrame()).toBe(JSON.stringify(mockVariants));
    expect(fs.readFile).toHaveBeenCalledWith('/path/to/logo.json', 'utf-8');
  });

  it('handles file read errors gracefully', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

    const { lastFrame, rerender } = render(
      <TestComponent path="/invalid/path.json" />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    rerender(<TestComponent path="/invalid/path.json" />);

    expect(lastFrame()).toBe('undefined');
    expect(fs.readFile).toHaveBeenCalledWith('/invalid/path.json', 'utf-8');
  });

  it('handles JSON parse errors gracefully', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('INVALID JSON');

    const { lastFrame, rerender } = render(
      <TestComponent path="/path/to/bad.json" />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    rerender(<TestComponent path="/path/to/bad.json" />);

    expect(lastFrame()).toBe('undefined');
  });
});
