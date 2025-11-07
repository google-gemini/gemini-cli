/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders as render } from '../../../test-utils/render.js';
import { act } from 'react';
import { DinoGame } from './DinoGame.js';

describe('DinoGame Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /*
  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const { stdin, unmount } = render(<DinoGame onClose={onClose} />);

    await act(async () => {
      stdin.write('\x1b'); // Escape
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });
  */

  // Ctrl+C might be tricky to test if ink/useKeypress mocks don't handle \x03 exactly as expected,
  // but let's try.
  it('calls onClose when Ctrl+C is pressed', async () => {
    const onClose = vi.fn();
    const { stdin, unmount } = render(<DinoGame onClose={onClose} />);

    await act(async () => {
      // This usually triggers process.exit in real node, but in test environment
      // it should be caught by ink/readline if mocked correctly.
      // If useKeypress handles it, it should work.
      stdin.write('\x03');
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });
});
