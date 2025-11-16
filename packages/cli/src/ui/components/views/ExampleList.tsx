/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';

interface ExampleData {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  estimatedTime: string;
  tags: string[];
  examplePrompt: string;
  expectedOutcome: string;
  tips: string[];
  prerequisites?: string[];
}

interface ExampleListProps {
  examples: readonly ExampleData[];
  category?: string;
  difficulty?: string;
  searchQuery?: string;
  featured?: boolean;
  showDetails?: boolean;
  terminalWidth: number;
}

const getDifficultyColor = (
  difficulty: string,
): string | typeof theme.text.primary => {
  switch (difficulty.toLowerCase()) {
    case 'beginner':
      return theme.text.success;
    case 'intermediate':
      return theme.text.warning;
    case 'advanced':
      return theme.text.error;
    default:
      return theme.text.primary;
  }
};

const ExampleCard: React.FC<{
  example: ExampleData;
  showDetails: boolean;
  terminalWidth: number;
}> = ({ example, showDetails, terminalWidth }) => (
  <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
    <Box flexDirection="row">
      <Text bold color={theme.text.accent}>
        {example.title}
      </Text>
      <Text color={theme.text.secondary}> ({example.id})</Text>
    </Box>

    {showDetails && (
      <>
        <Box marginTop={1}>
          <MarkdownDisplay
            terminalWidth={terminalWidth}
            text={example.description}
            isPending={false}
          />
        </Box>

        <Box marginTop={1} flexDirection="row" gap={2}>
          <Text color={theme.text.secondary}>
            Category:{' '}
            <Text color={theme.text.accent}>{example.category}</Text>
          </Text>
          <Text color={theme.text.secondary}>
            Difficulty:{' '}
            <Text color={getDifficultyColor(example.difficulty)}>
              {example.difficulty}
            </Text>
          </Text>
          <Text color={theme.text.secondary}>
            Time: <Text color={theme.text.accent}>{example.estimatedTime}</Text>
          </Text>
        </Box>

        {example.tags.length > 0 && (
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>
              Tags: {example.tags.join(', ')}
            </Text>
          </Box>
        )}

        {example.prerequisites && example.prerequisites.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.text.warning}>Prerequisites:</Text>
            {example.prerequisites.map((prereq, idx) => (
              <Text key={idx} color={theme.text.secondary}>
                {'  '}- {prereq}
              </Text>
            ))}
          </Box>
        )}

        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            Prompt:
          </Text>
          <Box paddingLeft={2}>
            <MarkdownDisplay
              terminalWidth={terminalWidth - 4}
              text={example.examplePrompt}
              isPending={false}
            />
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            Expected Outcome:
          </Text>
          <Box paddingLeft={2}>
            <MarkdownDisplay
              terminalWidth={terminalWidth - 4}
              text={example.expectedOutcome}
              isPending={false}
            />
          </Box>
        </Box>

        {example.tips.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color={theme.text.success}>
              💡 Tips:
            </Text>
            {example.tips.map((tip, idx) => (
              <Box key={idx} paddingLeft={2}>
                <Text color={theme.text.secondary}>• {tip}</Text>
              </Box>
            ))}
          </Box>
        )}

        <Box marginTop={1}>
          <Text color={theme.text.info}>
            Run with: <Text bold>/examples run {example.id}</Text>
          </Text>
        </Box>
      </>
    )}

    {!showDetails && (
      <>
        <Box paddingLeft={2}>
          <Text color={theme.text.secondary}>{example.description}</Text>
        </Box>
        <Box paddingLeft={2} marginTop={1} flexDirection="row" gap={2}>
          <Text color={getDifficultyColor(example.difficulty)}>
            [{example.difficulty}]
          </Text>
          <Text color={theme.text.secondary}>{example.category}</Text>
          <Text color={theme.text.secondary}>⏱ {example.estimatedTime}</Text>
        </Box>
      </>
    )}
  </Box>
);

export const ExampleList: React.FC<ExampleListProps> = ({
  examples,
  category,
  difficulty,
  searchQuery,
  featured,
  showDetails = false,
  terminalWidth,
}) => {
  if (examples.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>No examples found.</Text>
        <Box height={1} />
        <Text color={theme.text.secondary}>
          Try different search criteria or use <Text bold>/examples list</Text>{' '}
          to see all examples.
        </Text>
      </Box>
    );
  }

  // Build header message based on filters
  let header = '📚 ';
  if (searchQuery) {
    header += `Search results for "${searchQuery}"`;
  } else if (featured) {
    header += 'Featured Examples';
  } else if (category || difficulty) {
    const filters: string[] = [];
    if (category) filters.push(`category: ${category}`);
    if (difficulty) filters.push(`difficulty: ${difficulty}`);
    header += `Examples (${filters.join(', ')})`;
  } else {
    header += 'Available Examples';
  }

  return (
    <Box flexDirection="column">
      <Text bold color={theme.text.primary}>
        {header}
      </Text>
      <Box height={1} />

      {showDetails && examples.length === 1 ? (
        <ExampleCard
          example={examples[0]}
          showDetails={true}
          terminalWidth={terminalWidth}
        />
      ) : (
        <>
          {examples.map((example) => (
            <ExampleCard
              key={example.id}
              example={example}
              showDetails={showDetails}
              terminalWidth={terminalWidth}
            />
          ))}

          <Box marginTop={1}>
            <Text color={theme.text.secondary}>
              Found {examples.length} example{examples.length !== 1 ? 's' : ''}.
              Use{' '}
              <Text bold color={theme.text.info}>
                /examples show &lt;id&gt;
              </Text>{' '}
              for details or{' '}
              <Text bold color={theme.text.info}>
                /examples run &lt;id&gt;
              </Text>{' '}
              to execute.
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
};
