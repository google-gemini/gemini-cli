/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { AskUserQuestionDialog } from './AskUserQuestionDialog.js';
import type { Question } from '@google/gemini-cli-core';

// Helper to write to stdin with proper act() wrapping
const writeKey = async (
  stdin: { write: (data: string) => void },
  key: string,
  delay = 50,
) => {
  await act(async () => {
    stdin.write(key);
  });
  await new Promise((resolve) => setTimeout(resolve, delay));
};

describe('AskUserQuestionDialog', () => {
  const questions: Question[] = [
    {
      question: 'Q1?',
      header: 'H1',
      options: [
        { label: 'Opt1', description: 'Desc1' },
        { label: 'Opt2', description: 'Desc2' },
      ],
      multiSelect: false,
    },
  ];

  it('renders question and options', () => {
    const { lastFrame } = renderWithProviders(
      <AskUserQuestionDialog
        questions={questions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Q1?');
    expect(output).toContain('Opt1');
    expect(output).toContain('Desc1');
    expect(output).toContain('Opt2');
    expect(output).toContain('Desc2');
  });

  it('calls onSubmit with answers when an option is selected', async () => {
    const onSubmit = vi.fn();
    const { stdin } = renderWithProviders(
      <AskUserQuestionDialog
        questions={questions}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    // Press enter to select the first option
    await writeKey(stdin, '\r', 100);

    expect(onSubmit).toHaveBeenCalledWith({ '0': 'Opt1' });
  });

  it('handles multi-select and done', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Select features:',
        header: 'Features',
        options: [
          { label: 'Feature1', description: 'Desc1' },
          { label: 'Feature2', description: 'Desc2' },
        ],
        multiSelect: true,
      },
    ];
    const onSubmit = vi.fn();
    const { stdin } = renderWithProviders(
      <AskUserQuestionDialog
        questions={multiQuestions}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    // Toggle Feature1 (Enter)
    await writeKey(stdin, '\r');

    // Move down to Feature2 (down arrow)
    await writeKey(stdin, '\x1b[B');

    // Toggle Feature2 (Enter)
    await writeKey(stdin, '\r');

    // Move down to Other (down arrow)
    await writeKey(stdin, '\x1b[B');

    // Move down to Done
    await writeKey(stdin, '\x1b[B');

    // Press Enter on Done
    await writeKey(stdin, '\r', 100);

    expect(onSubmit).toHaveBeenCalledWith({ '0': 'Feature1, Feature2' });
  });

  it('handles Other option in single select with inline typing', async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <AskUserQuestionDialog
        questions={questions}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    // Move down to Other
    await writeKey(stdin, '\x1b[B');
    await writeKey(stdin, '\x1b[B');

    // Should show placeholder when Other is focused
    expect(lastFrame()).toContain('Enter a custom value');

    // Type directly (inline) - no need to press Enter first
    for (const char of 'Custom Value') {
      await writeKey(stdin, char, 10);
    }

    // Should show the typed text
    expect(lastFrame()).toContain('Custom Value');

    // Press Enter to submit the custom value
    await writeKey(stdin, '\r', 100);

    expect(onSubmit).toHaveBeenCalledWith({ '0': 'Custom Value' });
  });

  it('shows progress header for multiple questions', () => {
    const multiQuestions: Question[] = [
      {
        question: 'Q1?',
        header: 'First',
        options: [
          { label: 'Opt1', description: 'Desc1' },
          { label: 'Opt2', description: 'Desc2' },
        ],
        multiSelect: false,
      },
      {
        question: 'Q2?',
        header: 'Second',
        options: [
          { label: 'Opt3', description: 'Desc3' },
          { label: 'Opt4', description: 'Desc4' },
        ],
        multiSelect: false,
      },
    ];

    const { lastFrame } = renderWithProviders(
      <AskUserQuestionDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const output = lastFrame();
    // Should show progress header with both question headers
    expect(output).toContain('First');
    expect(output).toContain('Second');
    // Should show navigation arrows
    expect(output).toContain('←');
    expect(output).toContain('→');
  });

  it('hides progress header for single question', () => {
    const { lastFrame } = renderWithProviders(
      <AskUserQuestionDialog
        questions={questions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const output = lastFrame();
    // Should not show navigation arrows for single question
    // (header may still appear in the question view itself)
    expect(output).not.toMatch(/←.*□.*→/);
  });

  it('shows keyboard hints', () => {
    const { lastFrame } = renderWithProviders(
      <AskUserQuestionDialog
        questions={questions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Enter to select');
    expect(output).toContain('Esc to cancel');
  });

  it('navigates between questions with arrow keys', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Q1?',
        header: 'First',
        options: [{ label: 'Opt1', description: 'Desc1' }],
        multiSelect: false,
      },
      {
        question: 'Q2?',
        header: 'Second',
        options: [{ label: 'Opt2', description: 'Desc2' }],
        multiSelect: false,
      },
    ];

    const { stdin, lastFrame } = renderWithProviders(
      <AskUserQuestionDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Initially on Q1
    expect(lastFrame()).toContain('Q1?');

    // Navigate to next question with right arrow
    await writeKey(stdin, '\x1b[C'); // Right arrow escape sequence

    expect(lastFrame()).toContain('Q2?');

    // Navigate back with left arrow
    await writeKey(stdin, '\x1b[D'); // Left arrow escape sequence

    expect(lastFrame()).toContain('Q1?');
  });

  it('preserves answers when navigating back', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Q1?',
        header: 'First',
        options: [{ label: 'Opt1', description: 'Desc1' }],
        multiSelect: false,
      },
      {
        question: 'Q2?',
        header: 'Second',
        options: [{ label: 'Opt2', description: 'Desc2' }],
        multiSelect: false,
      },
    ];

    const onSubmit = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <AskUserQuestionDialog
        questions={multiQuestions}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    // Answer first question (should auto-advance to second)
    await writeKey(stdin, '\r', 100);

    // Should be on Q2 now
    expect(lastFrame()).toContain('Q2?');

    // Navigate back to Q1
    await writeKey(stdin, '\x1b[D'); // Left arrow

    // Should be on Q1
    expect(lastFrame()).toContain('Q1?');

    // Navigate forward again
    await writeKey(stdin, '\x1b[C'); // Right arrow

    // Answer second question
    await writeKey(stdin, '\r', 100);

    // Both answers should be submitted
    expect(onSubmit).toHaveBeenCalledWith({ '0': 'Opt1', '1': 'Opt2' });
  });
});
