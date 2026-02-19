/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
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
  // Ensure keystrokes appear spaced in time to avoid bufferFastReturn
  // converting Enter into Shift+Enter during synchronous test execution.
  let mockTime: number;
  beforeEach(() => {
    mockTime = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (mockTime += 50));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const authQuestion: Question[] = [
    {
      question: 'Which authentication method should we use?',
      header: 'Auth',
      type: QuestionType.CHOICE,
      options: [
        { label: 'OAuth 2.0', description: 'Industry standard, supports SSO' },
        { label: 'JWT tokens', description: 'Stateless, good for APIs' },
      ],
      multiSelect: false,
    },
  ];

  it('renders question and options', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <AskUserDialog
        questions={authQuestion}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    await waitUntilReady();
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
          type: QuestionType.CHOICE,
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

      await waitFor(async () => {
        expect(onSubmit).toHaveBeenCalledWith(expectedSubmit);
      });
    });
  });

  it('handles custom option in single select with inline typing', async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
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

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toContain('Enter a custom value');
    });

    // Type directly (inline)
    for (const char of 'API Key') {
      writeKey(stdin, char);
    }

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toContain('API Key');
    });

    // Press Enter to submit the custom value
    writeKey(stdin, '\r');

    await waitFor(async () => {
      expect(onSubmit).toHaveBeenCalledWith({ '0': 'API Key' });
    });
  });

  it('supports multi-line input for "Other" option in choice questions', async () => {
    const authQuestionWithOther: Question[] = [
      {
        question: 'Which authentication method?',
        header: 'Auth',
        type: QuestionType.CHOICE,
        options: [{ label: 'OAuth 2.0', description: '' }],
        multiSelect: false,
      },
    ];

    const onSubmit = vi.fn();
    const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
      <AskUserDialog
        questions={authQuestionWithOther}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    // Navigate to "Other" option
    writeKey(stdin, '\x1b[B'); // Down to "Other"

    // Type first line
    for (const char of 'Line 1') {
      writeKey(stdin, char);
    }

    // Insert newline using \ + Enter (handled by bufferBackslashEnter)
    writeKey(stdin, '\\');
    writeKey(stdin, '\r');

    // Type second line
    for (const char of 'Line 2') {
      writeKey(stdin, char);
    }

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toContain('Line 1');
      await waitUntilReady();
      expect(lastFrame()).toContain('Line 2');
    });

    // Press Enter to submit
    writeKey(stdin, '\r');

    await waitFor(async () => {
      expect(onSubmit).toHaveBeenCalledWith({ '0': 'Line 1\nLine 2' });
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
            type: QuestionType.CHOICE,
            options: Array.from({ length: 15 }, (_, i) => ({
              label: `Option ${i + 1}`,
              description: `Description ${i + 1}`,
            })),
            multiSelect: false,
          },
        ];

        const { lastFrame, waitUntilReady } = renderWithProviders(
          <AskUserDialog
            questions={questions}
            onSubmit={vi.fn()}
            onCancel={vi.fn()}
            width={80}
            availableHeight={10} // Small height to force scrolling
          />,
          { useAlternateBuffer },
        );

        await waitFor(async () => {
          if (expectedArrows) {
            await waitUntilReady();
            expect(lastFrame()).toContain('▲');
            await waitUntilReady();
            expect(lastFrame()).toContain('▼');
          } else {
            await waitUntilReady();
            expect(lastFrame()).not.toContain('▲');
            await waitUntilReady();
            expect(lastFrame()).not.toContain('▼');
          }
          await waitUntilReady();
          expect(lastFrame()).toMatchSnapshot();
        });
      });
    },
  );

  it('navigates to custom option when typing unbound characters (Type-to-Jump)', async () => {
    const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
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

    await waitFor(async () => {
      // Should show the custom input with 'A'
      // Placeholder is hidden when text is present
      await waitUntilReady();
      expect(lastFrame()).toContain('A');
      await waitUntilReady();
      expect(lastFrame()).toContain('3.  A');
    });

    // Continue typing
    writeKey(stdin, 'P');
    writeKey(stdin, 'I');

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toContain('API');
    });
  });

  it('shows progress header for multiple questions', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Which database should we use?',
        header: 'Database',
        type: QuestionType.CHOICE,
        options: [
          { label: 'PostgreSQL', description: 'Relational database' },
          { label: 'MongoDB', description: 'Document database' },
        ],
        multiSelect: false,
      },
      {
        question: 'Which ORM do you prefer?',
        header: 'ORM',
        type: QuestionType.CHOICE,
        options: [
          { label: 'Prisma', description: 'Type-safe ORM' },
          { label: 'Drizzle', description: 'Lightweight ORM' },
        ],
        multiSelect: false,
      },
    ];

    const { lastFrame, waitUntilReady } = renderWithProviders(
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('hides progress header for single question', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <AskUserDialog
        questions={authQuestion}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('shows keyboard hints', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <AskUserDialog
        questions={authQuestion}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('navigates between questions with arrow keys', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Which testing framework?',
        header: 'Testing',
        type: QuestionType.CHOICE,
        options: [{ label: 'Vitest', description: 'Fast unit testing' }],
        multiSelect: false,
      },
      {
        question: 'Which CI provider?',
        header: 'CI',
        type: QuestionType.CHOICE,
        options: [
          { label: 'GitHub Actions', description: 'Built into GitHub' },
        ],
        multiSelect: false,
      },
    ];

    const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    await waitUntilReady();
    expect(lastFrame()).toContain('Which testing framework?');

    writeKey(stdin, '\x1b[C'); // Right arrow

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toContain('Which CI provider?');
    });

    writeKey(stdin, '\x1b[D'); // Left arrow

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toContain('Which testing framework?');
    });
  });

  it('preserves answers when navigating back', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Which package manager?',
        header: 'Package',
        type: QuestionType.CHOICE,
        options: [{ label: 'pnpm', description: 'Fast, disk efficient' }],
        multiSelect: false,
      },
      {
        question: 'Which bundler?',
        header: 'Bundler',
        type: QuestionType.CHOICE,
        options: [{ label: 'Vite', description: 'Next generation bundler' }],
        multiSelect: false,
      },
    ];

    const onSubmit = vi.fn();
    const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
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

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toContain('Which bundler?');
    });

    // Navigate back
    writeKey(stdin, '\x1b[D');

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toContain('Which package manager?');
    });

    // Navigate forward
    writeKey(stdin, '\x1b[C');

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toContain('Which bundler?');
    });

    // Answer second question
    writeKey(stdin, '\r');

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toContain('Review your answers:');
    });

    // Submit from Review
    writeKey(stdin, '\r');

    await waitFor(async () => {
      expect(onSubmit).toHaveBeenCalledWith({ '0': 'pnpm', '1': 'Vite' });
    });
  });

  it('shows Review tab in progress header for multiple questions', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Which framework?',
        header: 'Framework',
        type: QuestionType.CHOICE,
        options: [
          { label: 'React', description: 'Component library' },
          { label: 'Vue', description: 'Progressive framework' },
        ],
        multiSelect: false,
      },
      {
        question: 'Which styling?',
        header: 'Styling',
        type: QuestionType.CHOICE,
        options: [
          { label: 'Tailwind', description: 'Utility-first CSS' },
          { label: 'CSS Modules', description: 'Scoped styles' },
        ],
        multiSelect: false,
      },
    ];

    const { lastFrame, waitUntilReady } = renderWithProviders(
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('allows navigating to Review tab and back', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Create tests?',
        header: 'Tests',
        type: QuestionType.CHOICE,
        options: [{ label: 'Yes', description: 'Generate test files' }],
        multiSelect: false,
      },
      {
        question: 'Add documentation?',
        header: 'Docs',
        type: QuestionType.CHOICE,
        options: [{ label: 'Yes', description: 'Generate JSDoc comments' }],
        multiSelect: false,
      },
    ];

    const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
      <AskUserDialog
        questions={multiQuestions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        width={120}
      />,
      { width: 120 },
    );

    writeKey(stdin, '\x1b[C'); // Right arrow

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toContain('Add documentation?');
    });

    writeKey(stdin, '\x1b[C'); // Right arrow to Review

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
    });

    writeKey(stdin, '\x1b[D'); // Left arrow back

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toContain('Add documentation?');
    });
  });

  it('shows warning for unanswered questions on Review tab', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Which license?',
        header: 'License',
        type: QuestionType.CHOICE,
        options: [{ label: 'MIT', description: 'Permissive license' }],
        multiSelect: false,
      },
      {
        question: 'Include README?',
        header: 'README',
        type: QuestionType.CHOICE,
        options: [{ label: 'Yes', description: 'Generate README.md' }],
        multiSelect: false,
      },
    ];

    const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
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

    await waitFor(async () => {
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  it('submits with unanswered questions when user confirms on Review', async () => {
    const multiQuestions: Question[] = [
      {
        question: 'Target Node version?',
        header: 'Node',
        type: QuestionType.CHOICE,
        options: [{ label: 'Node 20', description: 'LTS version' }],
        multiSelect: false,
      },
      {
        question: 'Enable strict mode?',
        header: 'Strict',
        type: QuestionType.CHOICE,
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

    await waitFor(async () => {
      expect(onSubmit).toHaveBeenCalledWith({ '0': 'Node 20' });
    });
  });

  describe('Text type questions', () => {
    it('renders text input for type: "text"', async () => {
      const textQuestion: Question[] = [
        {
          question: 'What should we name this component?',
          header: 'Name',
          type: QuestionType.TEXT,
          placeholder: 'e.g., UserProfileCard',
        },
      ];

      const { lastFrame, waitUntilReady } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
        />,
        { width: 120 },
      );

      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
    });

    it('shows default placeholder when none provided', async () => {
      const textQuestion: Question[] = [
        {
          question: 'Enter the database connection string:',
          header: 'Database',
          type: QuestionType.TEXT,
        },
      ];

      const { lastFrame, waitUntilReady } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
        />,
        { width: 120 },
      );

      await waitUntilReady();
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

      const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
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

      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('abc');
      });

      writeKey(stdin, '\x7f'); // Backspace

      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('ab');
        await waitUntilReady();
        expect(lastFrame()).not.toContain('abc');
      });
    });

    it('shows correct keyboard hints for text type', async () => {
      const textQuestion: Question[] = [
        {
          question: 'Enter the variable name:',
          header: 'Variable',
          type: QuestionType.TEXT,
        },
      ];

      const { lastFrame, waitUntilReady } = renderWithProviders(
        <AskUserDialog
          questions={textQuestion}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
        />,
        { width: 120 },
      );

      await waitUntilReady();
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
          type: QuestionType.CHOICE,
          options: [
            { label: 'Yes', description: 'Use async/await' },
            { label: 'No', description: 'Synchronous hook' },
          ],
          multiSelect: false,
        },
      ];

      const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
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

      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('Should it be async?');
      });

      writeKey(stdin, '\x1b[D'); // Left arrow should work when NOT focusing a text input

      await waitFor(async () => {
        await waitUntilReady();
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
          type: QuestionType.CHOICE,
          options: [
            { label: 'CSS Modules', description: 'Scoped CSS' },
            { label: 'Tailwind', description: 'Utility classes' },
          ],
          multiSelect: false,
        },
      ];

      const onSubmit = vi.fn();
      const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
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

      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('Which styling approach?');
      });

      writeKey(stdin, '\r');

      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('Review your answers:');
        await waitUntilReady();
        expect(lastFrame()).toContain('Name');
        await waitUntilReady();
        expect(lastFrame()).toContain('DataTable');
        await waitUntilReady();
        expect(lastFrame()).toContain('Style');
        await waitUntilReady();
        expect(lastFrame()).toContain('CSS Modules');
      });

      writeKey(stdin, '\r');

      await waitFor(async () => {
        expect(onSubmit).toHaveBeenCalledWith({
          '0': 'DataTable',
          '1': 'CSS Modules',
        });
      });
    });

    it('submits empty text as unanswered', async () => {
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

      await waitFor(async () => {
        expect(onSubmit).toHaveBeenCalledWith({});
      });
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
      const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
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

      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('SomeText');
      });

      // Send Ctrl+C
      writeKey(stdin, '\x03'); // Ctrl+C

      await waitFor(async () => {
        // Text should be cleared
        await waitUntilReady();
        expect(lastFrame()).not.toContain('SomeText');
        await waitUntilReady();
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
          type: QuestionType.CHOICE,
          options: [{ label: 'Option 1', description: '' }],
          multiSelect: false,
        },
        {
          question: 'Text Q?',
          header: 'Text',
          type: QuestionType.TEXT,
        },
      ];

      const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
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
      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('Text Q?');
      });

      // 2. Type something in Text Q to make isEditingCustomOption true
      writeKey(stdin, 'a');
      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('a');
      });

      // 3. Move back to Choice Q (Left arrow works because cursor is at left edge)
      // When typing 'a', cursor is at index 1.
      // We need to move cursor to index 0 first for Left arrow to work for navigation.
      writeKey(stdin, '\x1b[D'); // Left arrow moves cursor to index 0
      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('Text Q?');
      });

      writeKey(stdin, '\x1b[D'); // Second Left arrow should now trigger navigation
      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('Choice Q?');
      });

      // 4. Immediately try Right arrow to go back to Text Q
      writeKey(stdin, '\x1b[C');
      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('Text Q?');
      });
    });

    it('handles rapid sequential answers correctly (stale closure protection)', async () => {
      const multiQuestions: Question[] = [
        {
          question: 'Question 1?',
          header: 'Q1',
          type: QuestionType.CHOICE,
          options: [{ label: 'A1', description: '' }],
          multiSelect: false,
        },
        {
          question: 'Question 2?',
          header: 'Q2',
          type: QuestionType.CHOICE,
          options: [{ label: 'A2', description: '' }],
          multiSelect: false,
        },
      ];

      const onSubmit = vi.fn();
      const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
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
      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('Question 2?');
      });

      act(() => {
        stdin.write('\r'); // Select A2 for Q2 -> triggers autoAdvance to Review
      });
      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toContain('Review your answers:');
      });

      act(() => {
        stdin.write('\r'); // Submit from Review
      });

      await waitFor(async () => {
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
          type: QuestionType.CHOICE,
          options: [{ label: 'Yes', description: '' }],
          multiSelect: false,
        },
      ];

      const { lastFrame, waitUntilReady } = renderWithProviders(
        <AskUserDialog
          questions={questions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
          availableHeight={40}
        />,
        { width: 120 },
      );

      await waitFor(async () => {
        await waitUntilReady();
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
          type: QuestionType.CHOICE,
          options: [{ label: 'Yes', description: '' }],
          multiSelect: false,
        },
      ];

      const { lastFrame, waitUntilReady } = renderWithProviders(
        <AskUserDialog
          questions={questions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
          availableHeight={40}
        />,
        { width: 120 },
      );

      await waitFor(async () => {
        await waitUntilReady();
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
          type: QuestionType.CHOICE,
          options: [{ label: 'Yes', description: '' }],
          multiSelect: false,
        },
      ];

      const { lastFrame, waitUntilReady } = renderWithProviders(
        <AskUserDialog
          questions={questions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
          availableHeight={40}
        />,
        { width: 120 },
      );

      await waitFor(async () => {
        await waitUntilReady();
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
          type: QuestionType.CHOICE,
          options: [{ label: 'Yes', description: '' }],
          multiSelect: false,
        },
      ];

      const { lastFrame, waitUntilReady } = renderWithProviders(
        <AskUserDialog
          questions={questions}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          width={120}
          availableHeight={40}
        />,
        { width: 120 },
      );

      await waitFor(async () => {
        await waitUntilReady();
        const frame = lastFrame();
        // Backticks should be removed
        expect(frame).toContain('npm start');
        expect(frame).not.toContain('`npm start`');
      });
    });
  });

  it('uses availableTerminalHeight from UIStateContext if availableHeight prop is missing', async () => {
    const questions: Question[] = [
      {
        question: 'Choose an option',
        header: 'Context Test',
        type: QuestionType.CHOICE,
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

    const { lastFrame, waitUntilReady } = renderWithProviders(
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
    await waitUntilReady();
    expect(lastFrame()).toContain('▲');
    await waitUntilReady();
    expect(lastFrame()).toContain('▼');
  });

  it('does NOT truncate the question when in alternate buffer mode even with small height', async () => {
    const longQuestion =
      'This is a very long question ' + 'with many words '.repeat(10);
    const questions: Question[] = [
      {
        question: longQuestion,
        header: 'Alternate Buffer Test',
        type: QuestionType.CHOICE,
        options: [{ label: 'Option 1', description: 'Desc 1' }],
        multiSelect: false,
      },
    ];

    const mockUIState = {
      availableTerminalHeight: 5,
    } as UIState;

    const { lastFrame, waitUntilReady } = renderWithProviders(
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
    await waitUntilReady();
    expect(lastFrame()).not.toContain('hidden ...');
    // Should contain the full long question (or at least its parts)
    await waitUntilReady();
    expect(lastFrame()).toContain('This is a very long question');
  });

  describe('Choice question placeholder', () => {
    it('uses placeholder for "Other" option when provided', async () => {
      const questions: Question[] = [
        {
          question: 'Select your preferred language:',
          header: 'Language',
          type: QuestionType.CHOICE,
          options: [
            { label: 'TypeScript', description: '' },
            { label: 'JavaScript', description: '' },
          ],
          placeholder: 'Type another language...',
          multiSelect: false,
        },
      ];

      const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
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

      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toMatchSnapshot();
      });
    });

    it('uses default placeholder when not provided', async () => {
      const questions: Question[] = [
        {
          question: 'Select your preferred language:',
          header: 'Language',
          type: QuestionType.CHOICE,
          options: [
            { label: 'TypeScript', description: '' },
            { label: 'JavaScript', description: '' },
          ],
          multiSelect: false,
        },
      ];

      const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
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

      await waitFor(async () => {
        await waitUntilReady();
        expect(lastFrame()).toMatchSnapshot();
      });
    });
  });
});
