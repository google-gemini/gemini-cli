/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { AskUserDialog } from './AskUserDialog.js';
import { QuestionType, type Question } from '@google/gemini-cli-core';

// Helper to write to stdin with proper act() wrapping
const writeKey = (stdin: { write: (data: string) => void }, key: string) => {
  act(() => {
    stdin.write(key);
  });
};

describe('AskUserDialog', () => {
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
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Which authentication method should we use?');
    expect(output).toContain('OAuth 2.0');
    expect(output).toContain('Industry standard, supports SSO');
    expect(output).toContain('JWT tokens');
    expect(output).toContain('Stateless, good for APIs');
  });

  it('calls onSubmit with answers when an option is selected', async () => {
    const onSubmit = vi.fn();
    const { stdin } = renderWithProviders(
      <AskUserDialog
        questions={authQuestion}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ '0': 'OAuth 2.0' });
    });
  });

  it('handles multi-select and done', async () => {
    const featuresQuestion: Question[] = [
      {
        question: 'Which features should be included?',
        header: 'Features',
        options: [
          { label: 'TypeScript', description: 'Add type safety' },
          { label: 'ESLint', description: 'Code linting' },
        ],
        multiSelect: true,
      },
    ];
    const onSubmit = vi.fn();
    const { stdin } = renderWithProviders(
      <AskUserDialog
        questions={featuresQuestion}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    // Toggle TypeScript (Enter)
    writeKey(stdin, '\r');
    // Move down to ESLint (down arrow)
    writeKey(stdin, '\x1b[B');
    // Toggle ESLint (Enter)
    writeKey(stdin, '\r');
    // Move down to custom option (down arrow)
    writeKey(stdin, '\x1b[B');
    // Move down to Done
    writeKey(stdin, '\x1b[B');
    // Press Enter on Done
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ '0': 'TypeScript, ESLint' });
    });
  });

  it('handles custom option in single select with inline typing', async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={authQuestion}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
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
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Database');
    expect(output).toContain('ORM');
    expect(output).toContain('←');
    expect(output).toContain('→');
  });

  it('hides progress header for single question', () => {
    const { lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={authQuestion}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).not.toMatch(/←.*□.*→/);
  });

  it('shows keyboard hints', () => {
    const { lastFrame } = renderWithProviders(
      <AskUserDialog
        questions={authQuestion}
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
      />,
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
      />,
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
      />,
    );

    const output = lastFrame();
    expect(output).toContain('≡');
    expect(output).toContain('Review');
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
      />,
    );

    writeKey(stdin, '\x1b[C'); // Right arrow

    await waitFor(() => {
      expect(lastFrame()).toContain('Add documentation?');
    });

    writeKey(stdin, '\x1b[C'); // Right arrow to Review

    await waitFor(() => {
      expect(lastFrame()).toContain('Review your answers:');
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
      />,
    );

    // Navigate directly to Review tab without answering
    writeKey(stdin, '\x1b[C');
    writeKey(stdin, '\x1b[C');

    await waitFor(() => {
      expect(lastFrame()).toContain('You have 2 unanswered questions');
      expect(lastFrame()).toContain('(not answered)');
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
      />,
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
        />,
      );

      const output = lastFrame();
      expect(output).toContain('What should we name this component?');
      expect(output).toContain('e.g., UserProfileCard');
      expect(output).toContain('>');
      expect(output).not.toContain('[');
      expect(output).not.toContain('1.');
    });

    it('handles text input and submission for text type', async () => {
      const textQuestion: Question[] = [
        {
          question: 'What should the API endpoint be called?',
          header: 'Endpoint',
          type: QuestionType.TEXT,
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

      for (const char of '/api/users') {
        writeKey(stdin, char);
      }

      await waitFor(() => {
        expect(lastFrame()).toContain('/api/users');
      });

      writeKey(stdin, '\r');

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ '0': '/api/users' });
      });
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
        />,
      );

      expect(lastFrame()).toContain('Enter your response');
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
        />,
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
        />,
      );

      const output = lastFrame();
      expect(output).toContain('Enter to submit');
      expect(output).toContain('Esc to cancel');
      expect(output).not.toContain('↑/↓');
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
        />,
      );

      for (const char of 'useAuth') {
        writeKey(stdin, char);
      }

      writeKey(stdin, '\x1b[C'); // Right arrow

      await waitFor(() => {
        expect(lastFrame()).toContain('Should it be async?');
      });

      writeKey(stdin, '\x1b[D'); // Left arrow

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
        />,
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
        />,
      );

      writeKey(stdin, '\r');

      // onSubmit should not be called for empty text
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
