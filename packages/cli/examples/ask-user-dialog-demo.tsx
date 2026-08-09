/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { render, Box, Text } from 'ink';
import { AskUserDialog } from '../src/ui/components/AskUserDialog.js';
import { KeypressProvider } from '../src/ui/contexts/KeypressContext.js';
import { QuestionType, type Question } from '@google/gemini-cli-core';

const DEMO_QUESTIONS: Question[] = [
  {
    question: 'What type of project are you building?',
    header: 'Project Type',
    options: [
      { label: 'Web Application', description: 'React, Next.js, or similar' },
      { label: 'CLI Tool', description: 'Command-line interface with Node.js' },
      { label: 'Library', description: 'NPM package or shared utility' },
    ],
    multiSelect: false,
  },
  {
    question: 'Which features should be enabled?',
    header: 'Features',
    options: [
      { label: 'TypeScript', description: 'Add static typing' },
      { label: 'ESLint', description: 'Add linting and formatting' },
      { label: 'Unit Tests', description: 'Add Vitest setup' },
      { label: 'CI/CD', description: 'Add GitHub Actions' },
    ],
    multiSelect: true,
  },
  {
    question: 'What is the project name?',
    header: 'Name',
    type: QuestionType.TEXT,
    placeholder: 'my-awesome-project',
  },
  {
    question: 'Initialize git repository?',
    header: 'Git',
    type: QuestionType.YESNO,
  },
];

const Demo = () => {
  const [result, setResult] = useState<null | { [key: string]: string }>(null);
  const [cancelled, setCancelled] = useState(false);

  if (cancelled) {
    return (
      <Box padding={1}>
        <Text color="red">
          Dialog was cancelled. Project initialization aborted.
        </Text>
      </Box>
    );
  }

  if (result) {
    return (
      <Box
        flexDirection="column"
        padding={1}
        borderStyle="single"
        borderColor="green"
      >
        <Text bold color="green">
          Success! Project Configuration:
        </Text>
        {DEMO_QUESTIONS.map((q, i) => (
          <Box key={i} marginTop={1}>
            <Text color="gray">{q.header}: </Text>
            <Text>{result[i] || '(not answered)'}</Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text color="dim">Press Ctrl+C to exit</Text>
        </Box>
      </Box>
    );
  }

  return (
    <KeypressProvider>
      <Box padding={1} flexDirection="column">
        <Text bold marginBottom={1}>
          AskUserDialog Demo
        </Text>
        <AskUserDialog
          questions={DEMO_QUESTIONS}
          onSubmit={setResult}
          onCancel={() => setCancelled(true)}
        />
      </Box>
    </KeypressProvider>
  );
};

render(<Demo />);
