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
import { QuestionType, type Question } from '@google/gemini-cli-core';
import chalk from 'chalk';
import { UIStateContext, type UIState } from '../contexts/UIStateContext.js';

// Helper to write to stdin with proper act() wrapping
const writeKey = (stdin: { write: (data: string) => void }, key: string) => {
  act(() => {
    stdin.write(key);
  });
};

describe('AskUserDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const authQuestion: Question[] = [
    {
      question: 'Which authentication method should we use?',
      header: 'Auth',
      options: [
        { label: 'OAuth 2.0', description: 'Industry standard, supports SSO' },
        { label: 'JWT tokens', description: 'Stateless, good for APIs' },
      ],
      multiSelect: false,
    },
  ];

  it('renders question and options', () => {
    const { lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={authQuestion}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  describe.each([
    {
      name: 'Single Select',
      questions: authQuestion,
      actions: (stdin: { write: (data: string) => void }) => {
        writeKey(stdin, '\r');
      },
      expectedSubmit: { '0': 'OAuth 2.0' },
    },
    {
      name: 'Multi-select',
      questions: [
        {
          question: 'Which features?',
          header: 'Features',
          options: [
            { label: 'TypeScript', description: '' },
            { label: 'ESLint', description: '' },
          ],
          multiSelect: true,
        },
      ] as Question[],
      actions: (stdin: { write: (data: string) => void }) => {
        writeKey(stdin, '\r'); // Toggle TS
        writeKey(stdin, '\x1b[B'); // Down
        writeKey(stdin, '\r'); // Toggle ESLint
        writeKey(stdin, '\x1b[B'); // Down to Other
        writeKey(stdin, '\x1b[B'); // Down to Done
        writeKey(stdin, '\r'); // Done
      },
      expectedSubmit: { '0': 'TypeScript, ESLint' },
    },
    {
      name: 'Text Input',
      questions: [
        {
          question: 'Name?',
          header: 'Name',
          type: QuestionType.TEXT,
        },
      ] as Question[],
      actions: (stdin: { write: (data: string) => void }) => {
        for (const char of 'test-app') {
          writeKey(stdin, char);
        }
        writeKey(stdin, '\r');
      },
      expectedSubmit: { '0': 'test-app' },
    },
  ])('Submission: $name', ({ name, questions, actions, expectedSubmit }) => {
    it(`submits correct values for ${name}`, async () => {
      const onSubmit = vi.fn();
      const { stdin } = renderWithProviders(
        <AskUserDialog
          questions={questions}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
          width={120}
        />,
        { width: 120 },
      );

      actions(stdin);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(expectedSubmit);
      });
    });
  });

  it('handles custom option in single select with inline typing', async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={authQuestion}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    // Move down to custom option
    writeKey(stdin, '\x1b[B');
    writeKey(stdin, '\x1b[B');

    await waitFor(() => {
      expect(lastFrame()).toContain('Enter a custom value');
    });

    // Type directly (inline)
    for (const char of 'API Key') {
      writeKey(stdin, char);
    }

    await waitFor(() => {
      expect(lastFrame()).toContain('API Key');
    });

    // Press Enter to submit the custom value
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ '0': 'API Key' });
    });
  });

  describe.each([
    { useAlternateBuffer: true, expectedArrows: false },
    { useAlternateBuffer: false, expectedArrows: true },
  ])(
    'Scroll Arrows (useAlternateBuffer: $useAlternateBuffer)',
    ({ useAlternateBuffer, expectedArrows }) => {
      it(`shows scroll arrows correctly when useAlternateBuffer is ${useAlternateBuffer}`, async () => {
        const questions: Question[] = [
          {
            question: 'Choose an option',
            header: 'Scroll Test',
            options: Array.from({ length: 15 }, (_, i) => ({
              label: `Option ${i + 1}`,
              description: `Description ${i + 1}`,
            })),
            multiSelect: false,
          },
        ];

        const { lastFrame } = renderWithProviders(
          <AskUserDialog
            questions={questions}
            onSubmit={vi.fn()}
            onCancel={vi.fn()}
            width={80}
            availableHeight={10} // Small height to force scrolling
          />,
          { useAlternateBuffer },
        );

        await waitFor(() => {
          if (expectedArrows) {
            expect(lastFrame()).toContain('▲');
            expect(lastFrame()).toContain('▼');
          } else {
            expect(lastFrame()).not.toContain('▲');
            expect(lastFrame()).not.toContain('▼');
          }
          expect(lastFrame()).toMatchSnapshot();
        });
      });
    },
  );

  it('navigates to custom option when typing unbound characters (Type-to-Jump)', async () => {
    const { stdin, lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={authQuestion}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    // Type a character without navigating down
    writeKey(stdin, 'A');

    await waitFor(() => {
      // Should show the custom input with 'A'
      // Placeholder is hidden when text is present
      expect(lastFrame()).toContain('A');
      expect(lastFrame()).toContain('3.  A');
    });

    // Continue typing
    writeKey(stdin, 'P');
    writeKey(stdin, 'I');

    await waitFor(() => {
      expect(lastFrame()).toContain('API');
    });
  });

  it('shows progress header for multiple questions', () => {
    const multiQuestions: Question[] = [
      {
        question: 'Which database should we use?',
        header: 'Database',
        options: [
          { label: 'PostgreSQL', description: 'Relational database' },
          { label: 'MongoDB', description: 'Document database' },
        ],
        multiSelect: false,
      },
      {
        question: 'Which ORM do you prefer?',
        header: 'ORM',
        options: [
          { label: 'Prisma', description: 'Type-safe ORM' },
          { label: 'Drizzle', description: 'Lightweight ORM' },
        ],
        multiSelect: false,
      },
    ];

    const { lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('hides progress header for single question', () => {
    const { lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={authQuestion}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('shows keyboard hints', () => {
    const { lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={authQuestion}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('navigates between questions with arrow keys', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Which testing framework?',
        header: 'Testing',
        options: [{ label: 'Vitest', description: 'Fast unit testing' }],
        multiSelect: false,
      },
      {
        question: 'Which CI provider?',
        header: 'CI',
        options: [
          { label: 'GitHub Actions', description: 'Built into GitHub' },
        ],
        multiSelect: false,
      },
    ];

    const { stdin, lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    expect(lastFrame()).toContain('Which testing framework?');

    writeKey(stdin, '\x1b[C'); // Right arrow

    await waitFor(() => {
      expect(lastFrame()).toContain('Which CI provider?');
    });

    writeKey(stdin, '\x1b[D'); // Left arrow

    await waitFor(() => {
      expect(lastFrame()).toContain('Which testing framework?');
    });
  });

  it('preserves answers when navigating back', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Which package manager?',
        header: 'Package',
        options: [{ label: 'pnpm', description: 'Fast, disk efficient' }],
        multiSelect: false,
      },
      {
        question: 'Which bundler?',
        header: 'Bundler',
        options: [{ label: 'Vite', description: 'Next generation bundler' }],
        multiSelect: false,
      },
    ];

    const onSubmit = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    // Answer first question (should auto-advance)
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(lastFrame()).toContain('Which bundler?');
    });

    // Navigate back
    writeKey(stdin, '\x1b[D');

    await waitFor(() => {
      expect(lastFrame()).toContain('Which package manager?');
    });

    // Navigate forward
    writeKey(stdin, '\x1b[C');

    await waitFor(() => {
      expect(lastFrame()).toContain('Which bundler?');
    });

    // Answer second question
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(lastFrame()).toContain('Review your answers:');
    });

    // Submit from Review
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ '0': 'pnpm', '1': 'Vite' });
    });
  });

  it('shows Review tab in progress header for multiple questions', () => {
    const multiQuestions: Question[] = [
      {
        question: 'Which framework?',
        header: 'Framework',
        options: [
          { label: 'React', description: 'Component library' },
          { label: 'Vue', description: 'Progressive framework' },
        ],
        multiSelect: false,
      },
      {
        question: 'Which styling?',
        header: 'Styling',
        options: [
          { label: 'Tailwind', description: 'Utility-first CSS' },
          { label: 'CSS Modules', description: 'Scoped styles' },
        ],
        multiSelect: false,
      },
    ];

    const { lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('allows navigating to Review tab and back', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Create tests?',
        header: 'Tests',
        options: [{ label: 'Yes', description: 'Generate test files' }],
        multiSelect: false,
      },
      {
        question: 'Add documentation?',
        header: 'Docs',
        options: [{ label: 'Yes', description: 'Generate JSDoc comments' }],
        multiSelect: false,
      },
    ];

    const { stdin, lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    writeKey(stdin, '\x1b[C'); // Right arrow

    await waitFor(() => {
      expect(lastFrame()).toContain('Add documentation?');
    });

    writeKey(stdin, '\x1b[C'); // Right arrow to Review

    await waitFor(() => {
      expect(lastFrame()).toMatchSnapshot();
    });

    writeKey(stdin, '\x1b[D'); // Left arrow back

    await waitFor(() => {
      expect(lastFrame()).toContain('Add documentation?');
    });
  });

  it('shows warning for unanswered questions on Review tab', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Which license?',
        header: 'License',
        options: [{ label: 'MIT', description: 'Permissive license' }],
        multiSelect: false,
      },
      {
        question: 'Include README?',
        header: 'README',
        options: [{ label: 'Yes', description: 'Generate README.md' }],
        multiSelect: false,
      },
    ];

    const { stdin, lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    // Navigate directly to Review tab without answering
    writeKey(stdin, '\x1b[C');
    writeKey(stdin, '\x1b[C');

    await waitFor(() => {
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  it('submits with unanswered questions when user confirms on Review', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Target Node version?',
        header: 'Node',
        options: [{ label: 'Node 20', description: 'LTS version' }],
        multiSelect: false,
      },
      {
        question: 'Enable strict mode?',
        header: 'Strict',
        options: [{ label: 'Yes', description: 'Strict TypeScript' }],
        multiSelect: false,
      },
    ];

    const onSubmit = vi.fn();
    const { stdin } = renderWithProviders(
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    // Answer only first question
    writeKey(stdin, '\r');
    // Navigate to Review tab
    writeKey(stdin, '\x1b[C');
    // Submit
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ '0': 'Node 20' });
    });
  });

  describe('Text type questions', () => {
    it('renders text input for type: "text"', () => {
      const textQuestion: Question[] = [
        {
          question: 'What should we name this component?',
          header: 'Name',
          type: QuestionType.TEXT,
          placeholder: 'e.g., UserProfileCard',
        },
      ];

      const { lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
        />,
        { width: 120 },
      );

      expect(lastFrame()).toMatchSnapshot();
    });

    it('shows default placeholder when none provided', () => {
      const textQuestion: Question[] = [
        {
          question: 'Enter the database connection string:',
          header: 'Database',
          type: QuestionType.TEXT,
        },
      ];

      const { lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
        />,
        { width: 120 },
      );

      expect(lastFrame()).toMatchSnapshot();
    });

    it('supports backspace in text mode', async () => {
      const textQuestion: Question[] = [
        {
          question: 'Enter the function name:',
          header: 'Function',
          type: QuestionType.TEXT,
        },
      ];

      const { stdin, lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
        />,
        { width: 120 },
      );

      for (const char of 'abc') {
        writeKey(stdin, char);
      }

      await waitFor(() => {
        expect(lastFrame()).toContain('abc');
      });

      writeKey(stdin, '\x7f'); // Backspace

      await waitFor(() => {
        expect(lastFrame()).toContain('ab');
        expect(lastFrame()).not.toContain('abc');
      });
    });

    it('shows correct keyboard hints for text type', () => {
      const textQuestion: Question[] = [
        {
          question: 'Enter the variable name:',
          header: 'Variable',
          type: QuestionType.TEXT,
        },
      ];

      const { lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
        />,
        { width: 120 },
      );

      expect(lastFrame()).toMatchSnapshot();
    });

    it('preserves text answer when navigating between questions', async () => {
      const mixedQuestions: Question[] = [
        {
          question: 'What should we name this hook?',
          header: 'Hook',
          type: QuestionType.TEXT,
        },
        {
          question: 'Should it be async?',
          header: 'Async',
          options: [
            { label: 'Yes', description: 'Use async/await' },
            { label: 'No', description: 'Synchronous hook' },
          ],
          multiSelect: false,
        },
      ];

      const { stdin, lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={mixedQuestions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
        />,
        { width: 120 },
      );

      for (const char of 'useAuth') {
        writeKey(stdin, char);
      }

      writeKey(stdin, '\t'); // Use Tab instead of Right arrow when text input is active

      await waitFor(() => {
        expect(lastFrame()).toContain('Should it be async?');
      });

      writeKey(stdin, '\x1b[D'); // Left arrow should work when NOT focusing a text input

      await waitFor(() => {
        expect(lastFrame()).toContain('useAuth');
      });
    });

    it('handles mixed text and choice questions', async () => {
      const mixedQuestions: Question[] = [
        {
          question: 'What should we name this component?',
          header: 'Name',
          type: QuestionType.TEXT,
          placeholder: 'Enter component name',
        },
        {
          question: 'Which styling approach?',
          header: 'Style',
          options: [
            { label: 'CSS Modules', description: 'Scoped CSS' },
            { label: 'Tailwind', description: 'Utility classes' },
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
          width={120}
        />,
        { width: 120 },
      );

      for (const char of 'DataTable') {
        writeKey(stdin, char);
      }

      writeKey(stdin, '\r');

      await waitFor(() => {
        expect(lastFrame()).toContain('Which styling approach?');
      });

      writeKey(stdin, '\r');

      await waitFor(() => {
        expect(lastFrame()).toContain('Review your answers:');
        expect(lastFrame()).toContain('Name');
        expect(lastFrame()).toContain('DataTable');
        expect(lastFrame()).toContain('Style');
        expect(lastFrame()).toContain('CSS Modules');
      });

      writeKey(stdin, '\r');

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          '0': 'DataTable',
          '1': 'CSS Modules',
        });
      });
    });

    it('does not submit empty text', () => {
      const textQuestion: Question[] = [
        {
          question: 'Enter the class name:',
          header: 'Class',
          type: QuestionType.TEXT,
        },
      ];

      const onSubmit = vi.fn();
      const { stdin } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
          width={120}
        />,
        { width: 120 },
      );

      writeKey(stdin, '\r');

      // onSubmit should not be called for empty text
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('clears text on Ctrl+C', async () => {
      const textQuestion: Question[] = [
        {
          question: 'Enter the class name:',
          header: 'Class',
          type: QuestionType.TEXT,
        },
      ];

      const onCancel = vi.fn();
      const { stdin, lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={vi.fn()}
          onCancel={onCancel}
          width={120}
        />,
        { width: 120 },
      );

      for (const char of 'SomeText') {
        writeKey(stdin, char);
      }

      await waitFor(() => {
        expect(lastFrame()).toContain('SomeText');
      });

      // Send Ctrl+C
      writeKey(stdin, '\x03'); // Ctrl+C

      await waitFor(() => {
        // Text should be cleared
        expect(lastFrame()).not.toContain('SomeText');
        expect(lastFrame()).toContain('>');
      });

      // Should NOT call onCancel (dialog should stay open)
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('allows immediate arrow navigation after switching away from text input', async () => {
      const multiQuestions: Question[] = [
        {
          question: 'Choice Q?',
          header: 'Choice',
          options: [{ label: 'Option 1', description: '' }],
          multiSelect: false,
        },
        {
          question: 'Text Q?',
          header: 'Text',
          type: QuestionType.TEXT,
        },
      ];

      const { stdin, lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={multiQuestions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
        />,
        { width: 120 },
      );

      // 1. Move to Text Q (Right arrow works for Choice Q)
      writeKey(stdin, '\x1b[C');
      await waitFor(() => {
        expect(lastFrame()).toContain('Text Q?');
      });

      // 2. Type something in Text Q to make isEditingCustomOption true
      writeKey(stdin, 'a');
      await waitFor(() => {
        expect(lastFrame()).toContain('a');
      });

      // 3. Move back to Choice Q (Left arrow works because cursor is at left edge)
      // When typing 'a', cursor is at index 1.
      // We need to move cursor to index 0 first for Left arrow to work for navigation.
      writeKey(stdin, '\x1b[D'); // Left arrow moves cursor to index 0
      await waitFor(() => {
        expect(lastFrame()).toContain('Text Q?');
      });

      writeKey(stdin, '\x1b[D'); // Second Left arrow should now trigger navigation
      await waitFor(() => {
        expect(lastFrame()).toContain('Choice Q?');
      });

      // 4. Immediately try Right arrow to go back to Text Q
      writeKey(stdin, '\x1b[C');
      await waitFor(() => {
        expect(lastFrame()).toContain('Text Q?');
      });
    });

    it('handles rapid sequential answers correctly (stale closure protection)', async () => {
      const multiQuestions: Question[] = [
        {
          question: 'Question 1?',
          header: 'Q1',
          options: [{ label: 'A1', description: '' }],
          multiSelect: false,
        },
        {
          question: 'Question 2?',
          header: 'Q2',
          options: [{ label: 'A2', description: '' }],
          multiSelect: false,
        },
      ];

      const onSubmit = vi.fn();
      const { stdin, lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={multiQuestions}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
          width={120}
        />,
        { width: 120 },
      );

      // Answer Q1 and Q2 sequentialy
      act(() => {
        stdin.write('\r'); // Select A1 for Q1 -> triggers autoAdvance
      });
      await waitFor(() => {
        expect(lastFrame()).toContain('Question 2?');
      });

      act(() => {
        stdin.write('\r'); // Select A2 for Q2 -> triggers autoAdvance to Review
      });
      await waitFor(() => {
        expect(lastFrame()).toContain('Review your answers:');
      });

      act(() => {
        stdin.write('\r'); // Submit from Review
      });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          '0': 'A1',
          '1': 'A2',
        });
      });
    });
  });

  describe('Markdown rendering', () => {
    it('auto-bolds plain single-line questions', async () => {
      const questions: Question[] = [
        {
          question: 'Which option do you prefer?',
          header: 'Test',
          options: [{ label: 'Yes', description: '' }],
          multiSelect: false,
        },
      ];

      const { lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={questions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
          availableHeight={40}
        />,
        { width: 120 },
      );

      await waitFor(() => {
        const frame = lastFrame();
        // Plain text should be rendered as bold
        expect(frame).toContain(chalk.bold('Which option do you prefer?'));
      });
    });

    it('does not auto-bold questions that already have markdown', async () => {
      const questions: Question[] = [
        {
          question: 'Is **this** working?',
          header: 'Test',
          options: [{ label: 'Yes', description: '' }],
          multiSelect: false,
        },
      ];

      const { lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={questions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
          availableHeight={40}
        />,
        { width: 120 },
      );

      await waitFor(() => {
        const frame = lastFrame();
        // Should NOT have double-bold (the whole question bolded AND "this" bolded)
        // "Is " should not be bold, only "this" should be bold
        expect(frame).toContain('Is ');
        expect(frame).toContain(chalk.bold('this'));
        expect(frame).not.toContain('**this**');
      });
    });

    it('renders bold markdown in question', async () => {
      const questions: Question[] = [
        {
          question: 'Is **this** working?',
          header: 'Test',
          options: [{ label: 'Yes', description: '' }],
          multiSelect: false,
        },
      ];

      const { lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={questions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
          availableHeight={40}
        />,
        { width: 120 },
      );

      await waitFor(() => {
        const frame = lastFrame();
        // Check for chalk.bold('this') - asterisks should be gone, text should be bold
        expect(frame).toContain(chalk.bold('this'));
        expect(frame).not.toContain('**this**');
      });
    });

    it('renders inline code markdown in question', async () => {
      const questions: Question[] = [
        {
          question: 'Run `npm start`?',
          header: 'Test',
          options: [{ label: 'Yes', description: '' }],
          multiSelect: false,
        },
      ];

      const { lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={questions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
          availableHeight={40}
        />,
        { width: 120 },
      );

      await waitFor(() => {
        const frame = lastFrame();
        // Backticks should be removed
        expect(frame).toContain('npm start');
        expect(frame).not.toContain('`npm start`');
      });
    });
  });

  it('uses availableTerminalHeight from UIStateContext if availableHeight prop is missing', () => {
    const questions: Question[] = [
      {
        question: 'Choose an option',
        header: 'Context Test',
        options: Array.from({ length: 10 }, (_, i) => ({
          label: `Option ${i + 1}`,
          description: `Description ${i + 1}`,
        })),
        multiSelect: false,
      },
    ];

    const mockUIState = {
      availableTerminalHeight: 5, // Small height to force scroll arrows
    } as UIState;

    const { lastFrame } = renderWithProviders(
      <UIStateContext.Provider value={mockUIState}>
        <AskUserDialog
          questions={questions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={80}
        />
      </UIStateContext.Provider>,
      { useAlternateBuffer: false },
    );

    // With height 5 and alternate buffer disabled, it should show scroll arrows (▲)
    expect(lastFrame()).toContain('▲');
    expect(lastFrame()).toContain('▼');
  });

  it('does NOT truncate the question when in alternate buffer mode even with small height', () => {
    const longQuestion =
      'This is a very long question ' + 'with many words '.repeat(10);
    const questions: Question[] = [
      {
        question: longQuestion,
        header: 'Alternate Buffer Test',
        options: [{ label: 'Option 1', description: 'Desc 1' }],
        multiSelect: false,
      },
    ];

    const mockUIState = {
      availableTerminalHeight: 5,
    } as UIState;

    const { lastFrame } = renderWithProviders(
      <UIStateContext.Provider value={mockUIState}>
        <AskUserDialog
          questions={questions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={40} // Small width to force wrapping
        />
      </UIStateContext.Provider>,
      { useAlternateBuffer: true },
    );

    // Should NOT contain the truncation message
    expect(lastFrame()).not.toContain('hidden ...');
    // Should contain the full long question (or at least its parts)
    expect(lastFrame()).toContain('This is a very long question');
  });

  describe('Choice question placeholder', () => {
    it('uses placeholder for "Other" option when provided', async () => {
      const questions: Question[] = [
        {
          question: 'Select your preferred language:',
          header: 'Language',
          options: [
            { label: 'TypeScript', description: '' },
            { label: 'JavaScript', description: '' },
          ],
          placeholder: 'Type another language...',
          multiSelect: false,
        },
      ];

      const { stdin, lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={questions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={80}
        />,
        { width: 80 },
      );

      // Navigate to the "Other" option
      writeKey(stdin, '\x1b[B'); // Down
      writeKey(stdin, '\x1b[B'); // Down to Other

      await waitFor(() => {
        expect(lastFrame()).toMatchSnapshot();
      });
    });

    it('uses default placeholder when not provided', async () => {
      const questions: Question[] = [
        {
          question: 'Select your preferred language:',
          header: 'Language',
          options: [
            { label: 'TypeScript', description: '' },
            { label: 'JavaScript', description: '' },
          ],
          multiSelect: false,
        },
      ];

      const { stdin, lastFrame } = renderWithProviders(
        <AskUserDialog
          questions={questions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={80}
        />,
        { width: 80 },
      );

      // Navigate to the "Other" option
      writeKey(stdin, '\x1b[B'); // Down
      writeKey(stdin, '\x1b[B'); // Down to Other

      await waitFor(() => {
        expect(lastFrame()).toMatchSnapshot();
      });
    });
  });
});
