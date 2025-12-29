/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '../../test-utils/render.js';
import { RewindConfirmation, RewindOutcome } from './RewindConfirmation.js';
import { act } from 'react';
import type { Key } from '../hooks/useKeypress.js';

// Mock useKeypress
const keypressHandlers: Array<(key: unknown) => void> = [];
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: (
    handler: (key: unknown) => void,
    options: { isActive: boolean },
  ) => {
    if (options?.isActive) {
      keypressHandlers.push(handler);
    }
  },
}));

const triggerKey = (partialKey: Partial<Key>) => {
  const key = {
    name: '',
    ctrl: false,
    meta: false,
    shift: false,
    sequence: '',
    ...partialKey,
  };
  act(() => {
    keypressHandlers.forEach((handler) => handler(key));
  });
};

describe('RewindConfirmation', () => {
  beforeEach(() => {
    keypressHandlers.length = 0;
    vi.clearAllMocks();
  });

  it('renders correctly with stats', () => {
    const stats = {
      addedLines: 10,
      removedLines: 5,
      fileCount: 1,
      firstFileName: 'test.ts',
    };
    const onConfirm = vi.fn();
    const { lastFrame } = render(
      <RewindConfirmation
        stats={stats}
        onConfirm={onConfirm}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Confirm Rewind');
    expect(lastFrame()).toContain('File: test.ts');
    expect(lastFrame()).toContain('Lines added: 10');
    expect(lastFrame()).toContain('Lines removed: 5');
    expect(lastFrame()).toContain(
      'Rewind conversation and revert code changes',
    );
  });

  it('renders correctly without stats', () => {
    const onConfirm = vi.fn();
    const { lastFrame } = render(
      <RewindConfirmation
        stats={null}
        onConfirm={onConfirm}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Confirm Rewind');
    expect(lastFrame()).toContain('No code changes to revert');
    expect(lastFrame()).toContain(
      'Rewind conversation and revert code changes',
    );
  });

  it('calls onConfirm with Cancel on Escape', () => {
    const onConfirm = vi.fn();
    render(
      <RewindConfirmation
        stats={null}
        onConfirm={onConfirm}
        terminalWidth={80}
      />,
    );

    triggerKey({ name: 'escape' });
    expect(onConfirm).toHaveBeenCalledWith(RewindOutcome.Cancel);
  });

  it('renders timestamp when provided', () => {
    const onConfirm = vi.fn();
    const timestamp = new Date().toISOString();
    const { lastFrame } = render(
      <RewindConfirmation
        stats={null}
        onConfirm={onConfirm}
        terminalWidth={80}
        timestamp={timestamp}
      />,
    );

    expect(lastFrame()).toContain('just now');
  });
});
