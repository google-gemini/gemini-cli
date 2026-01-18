/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { AskUserDialog } from './AskUserDialog.js';
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

describe('AskUserDialog', () => {
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
      <AskUserDialog
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
      <AskUserDialog
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
      <AskUserDialog
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
      <AskUserDialog
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
      <AskUserDialog
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
      <AskUserDialog
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
      <AskUserDialog
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
      <AskUserDialog
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
      <AskUserDialog
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

    // Answer second question (should advance to Review tab)
    await writeKey(stdin, '\r', 100);

    // Should be on Review tab now
    expect(lastFrame()).toContain('Review your answers:');

    // Press Enter on Review tab to submit
    await writeKey(stdin, '\r', 100);

    // Both answers should be submitted
    expect(onSubmit).toHaveBeenCalledWith({ '0': 'Opt1', '1': 'Opt2' });
  });

  it('shows Review tab in progress header for multiple questions', () => {
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
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const output = lastFrame();
    // Should show Review tab with menu icon
    expect(output).toContain('≡');
    expect(output).toContain('Review');
  });

  it('allows navigating to Review tab and back', async () => {
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
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Navigate to second question
    await writeKey(stdin, '\x1b[C'); // Right arrow

    // Should be on Q2
    expect(lastFrame()).toContain('Q2?');

    // Navigate to Review tab
    await writeKey(stdin, '\x1b[C'); // Right arrow

    // Should be on Review tab
    expect(lastFrame()).toContain('Review your answers:');

    // Navigate back to Q2
    await writeKey(stdin, '\x1b[D'); // Left arrow

    // Should be on Q2 again
    expect(lastFrame()).toContain('Q2?');
  });

  it('shows warning for unanswered questions on Review tab', async () => {
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
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Navigate directly to Review tab without answering
    await writeKey(stdin, '\x1b[C'); // Right arrow to Q2
    await writeKey(stdin, '\x1b[C'); // Right arrow to Review

    // Should show warning
    expect(lastFrame()).toContain('You have 2 unanswered questions');
    expect(lastFrame()).toContain('(not answered)');
  });

  it('submits with unanswered questions when user confirms on Review', async () => {
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
    const { stdin } = renderWithProviders(
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    // Answer only first question
    await writeKey(stdin, '\r', 100);

    // Navigate to Review tab
    await writeKey(stdin, '\x1b[C'); // Right arrow to Review

    // Press Enter to submit with partial answers
    await writeKey(stdin, '\r', 100);

    // Should submit with only the first answer
    expect(onSubmit).toHaveBeenCalledWith({ '0': 'Opt1' });
  });

  // Text-type question tests
  describe('Text type questions', () => {
    it('renders text input for type: "text"', () => {
      const textQuestion: Question[] = [
        {
          question: 'What should we name this component?',
          header: 'Name',
          type: 'text',
          placeholder: 'e.g., UserProfileCard',
        },
      ];

      const { lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      const output = lastFrame();
      expect(output).toContain('What should we name this component?');
      expect(output).toContain('e.g., UserProfileCard');
      // Should show the prompt indicator
      expect(output).toContain('>');
      // Should NOT show option selection UI (checkboxes, numbered options)
      expect(output).not.toContain('[');
      expect(output).not.toContain('1.');
    });

    it('handles text input and submission for text type', async () => {
      const textQuestion: Question[] = [
        {
          question: 'Enter a name:',
          header: 'Name',
          type: 'text',
        },
      ];

      const onSubmit = vi.fn();
      const { stdin, lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      );

      // Type text
      for (const char of 'MyComponent') {
        await writeKey(stdin, char, 10);
      }

      expect(lastFrame()).toContain('MyComponent');

      // Press Enter to submit
      await writeKey(stdin, '\r', 100);

      expect(onSubmit).toHaveBeenCalledWith({ '0': 'MyComponent' });
    });

    it('shows default placeholder when none provided', () => {
      const textQuestion: Question[] = [
        {
          question: 'Enter something:',
          header: 'Input',
          type: 'text',
        },
      ];

      const { lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(lastFrame()).toContain('Enter your response');
    });

    it('supports backspace in text mode', async () => {
      const textQuestion: Question[] = [
        {
          question: 'Enter name:',
          header: 'Name',
          type: 'text',
        },
      ];

      const { stdin, lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      // Type "abc"
      for (const char of 'abc') {
        await writeKey(stdin, char, 10);
      }
      expect(lastFrame()).toContain('abc');

      // Backspace
      await writeKey(stdin, '\x7f'); // Backspace
      expect(lastFrame()).toContain('ab');
      expect(lastFrame()).not.toContain('abc');
    });

    it('shows correct keyboard hints for text type', () => {
      const textQuestion: Question[] = [
        {
          question: 'Enter name:',
          header: 'Name',
          type: 'text',
        },
      ];

      const { lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      const output = lastFrame();
      expect(output).toContain('Enter to submit');
      expect(output).toContain('Esc to cancel');
      // Should NOT mention navigation since it's a single text question
      expect(output).not.toContain('↑/↓');
    });

    it('preserves text answer when navigating between questions', async () => {
      const mixedQuestions: Question[] = [
        {
          question: 'What name?',
          header: 'Name',
          type: 'text',
        },
        {
          question: 'Which style?',
          header: 'Style',
          options: [
            { label: 'Modern', description: 'Modern style' },
            { label: 'Classic', description: 'Classic style' },
          ],
          multiSelect: false,
        },
      ];

      const { stdin, lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={mixedQuestions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      // Type in first question (text type)
      for (const char of 'TestName') {
        await writeKey(stdin, char, 10);
      }

      // Navigate to second question
      await writeKey(stdin, '\x1b[C'); // Right arrow

      // Should be on choice question
      expect(lastFrame()).toContain('Which style?');

      // Navigate back
      await writeKey(stdin, '\x1b[D'); // Left arrow

      // Answer should be preserved
      expect(lastFrame()).toContain('TestName');
    });

    it('handles mixed text and choice questions', async () => {
      const mixedQuestions: Question[] = [
        {
          question: 'What name?',
          header: 'Name',
          type: 'text',
          placeholder: 'Enter name',
        },
        {
          question: 'Which color?',
          header: 'Color',
          options: [
            { label: 'Red', description: 'Red color' },
            { label: 'Blue', description: 'Blue color' },
          ],
          multiSelect: false,
        },
      ];

      const onSubmit = vi.fn();
      const { stdin, lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={mixedQuestions}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      );

      // Type text answer
      for (const char of 'MyName') {
        await writeKey(stdin, char, 10);
      }

      // Press Enter to submit text and advance
      await writeKey(stdin, '\r', 100);

      // Should be on choice question
      expect(lastFrame()).toContain('Which color?');

      // Select first option
      await writeKey(stdin, '\r', 100);

      // Should be on Review tab
      expect(lastFrame()).toContain('Review your answers:');
      expect(lastFrame()).toContain('Name');
      expect(lastFrame()).toContain('MyName');
      expect(lastFrame()).toContain('Color');
      expect(lastFrame()).toContain('Red');

      // Submit from Review
      await writeKey(stdin, '\r', 100);

      expect(onSubmit).toHaveBeenCalledWith({ '0': 'MyName', '1': 'Red' });
    });

    it('does not submit empty text', async () => {
      const textQuestion: Question[] = [
        {
          question: 'Enter name:',
          header: 'Name',
          type: 'text',
        },
      ];

      const onSubmit = vi.fn();
      const { stdin } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      );

      // Press Enter without typing anything
      await writeKey(stdin, '\r', 100);

      // Should not have submitted
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
