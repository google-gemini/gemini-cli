/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { AskUserDialog } from './AskUserDialog.js';
import type { Question } from '@google/gemini-cli-core';

describe('Key Bubbling Regression', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const choiceQuestion: Question[] = [
    {
      question: 'Choice Q?',
      header: 'Choice',
      options: [
        { label: 'Option 1', description: '' },
        { label: 'Option 2', description: '' },
      ],
      multiSelect: false,
    },
  ];

  it('does not navigate when pressing "j" or "k" in a focused text input', async () => {
    const { stdin, lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={choiceQuestion}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
        availableHeight={20}
      />,
      { width: 120 },
    );

    // 1. Move down to "Enter a custom value" (3rd item)
    act(() => {
      stdin.write('\x1b[B'); // Down arrow to Option 2
    });
    act(() => {
      stdin.write('\x1b[B'); // Down arrow to Custom
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('Enter a custom value');
    });

    // 2. Type "j"
    act(() => {
      stdin.write('j');
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('j');
      // Verify we are still focusing the custom option (3rd item in list)
      expect(lastFrame()).toMatch(/● 3\.\s+j/);
    });

    // 3. Type "k"
    act(() => {
      stdin.write('k');
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('jk');
      expect(lastFrame()).toMatch(/● 3\.\s+jk/);
    });
  });
});
