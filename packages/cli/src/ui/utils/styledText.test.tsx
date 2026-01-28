/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Text } from 'ink';
import { renderStyledText } from './styledText.js';

describe('I18n Styled Text Solution', () => {
  it('should render complete semantic text with styled interpolations', () => {
    const translatedText =
      'Add context: Use {symbol} to specify files for context (e.g., {example})';

    const component = renderStyledText(
      translatedText,
      {
        symbol: (
          <Text bold color="purple">
            @
          </Text>
        ),
        example: (
          <Text bold color="purple">
            @src/myFile.ts
          </Text>
        ),
      },
      'white',
    );

    const { lastFrame } = render(component);

    const output = lastFrame();

    // Should contain the complete semantic meaning
    expect(output).toContain('Add context');
    expect(output).toContain('Use');
    expect(output).toContain('specify files');
    expect(output).toContain('@');
    expect(output).toContain('@src/myFile.ts');
  });

  it('should apply correct styling attributes to interpolated components', () => {
    const translatedText = 'Use {symbol} to specify {example}';

    const component = renderStyledText(
      translatedText,
      {
        symbol: (
          <Text bold color="purple">
            @
          </Text>
        ),
        example: (
          <Text bold color="purple">
            files
          </Text>
        ),
      },
      'white',
    );

    // Verify component structure contains correct styling attributes
    const componentString = JSON.stringify(component);

    // Should contain Text components with correct props
    expect(componentString).toContain('"bold":true');
    expect(componentString).toContain('"color":"purple"');

    // Should contain the correct text content
    expect(componentString).toContain('"@"');
    expect(componentString).toContain('"files"');
  });

  it('should provide complete context for translators', () => {
    const translatedText =
      'Shell mode: Execute shell commands via {symbol} (e.g., {example}) or use natural language (e.g. {natural})';

    // Translator sees the complete sentence structure
    expect(translatedText).toContain('Shell mode: Execute shell commands');
    expect(translatedText).toContain('or use natural language');

    // Only styling placeholders, not semantic content
    expect(translatedText).toContain('{symbol}');
    expect(translatedText).toContain('{example}');
    expect(translatedText).not.toContain('!'); // Symbol not in translation
  });

  it('should throw error when style mappings are missing', () => {
    const translatedText = 'Use {symbol} and {missing} here';

    expect(() => {
      renderStyledText(translatedText, {
        symbol: <Text bold>@</Text>,
        // 'missing' key not provided
      });
    }).toThrowError(
      /renderStyledText mismatch: Missing style mappings for placeholders: \{missing\}/,
    );
  });

  it('should throw error when unused style mappings exist', () => {
    const translatedText = 'Use {symbol} here';

    expect(() => {
      renderStyledText(translatedText, {
        symbol: <Text bold>@</Text>,
        unused: <Text>Never used</Text>,
      });
    }).toThrowError(/renderStyledText mismatch: Unused style mappings: unused/);
  });

  it('should throw error with detailed information when both missing and unused mappings exist', () => {
    const translatedText = 'Use {symbol} and {missing} here';

    expect(() => {
      renderStyledText(translatedText, {
        symbol: <Text bold>@</Text>,
        unused1: <Text>Never used 1</Text>,
        unused2: <Text>Never used 2</Text>,
        // 'missing' key not provided
      });
    }).toThrowError(
      /renderStyledText mismatch: Missing style mappings for placeholders: \{missing\}\. Unused style mappings: unused1, unused2/,
    );
  });

  it('should provide complete error context with text and mappings', () => {
    const translatedText = 'Hello {name}!';

    expect(() => {
      renderStyledText(translatedText, {
        wrongKey: <Text>Wrong</Text>,
      });
    }).toThrowError(
      /Text: "Hello \{name\}!"\. Expected placeholders: \[name\]\. Provided style mappings: \[wrongKey\]/,
    );
  });

  describe('Regex Pattern Testing', () => {
    it('should correctly split text with single placeholder', () => {
      const { lastFrame } = render(
        renderStyledText('Hello {name}!', {
          name: <Text bold>World</Text>,
        }),
      );

      expect(lastFrame()).toContain('Hello');
      expect(lastFrame()).toContain('World');
      expect(lastFrame()).toContain('!');
    });

    it('should handle multiple placeholders correctly', () => {
      const { lastFrame } = render(
        renderStyledText('{greeting} {name}, welcome to {place}!', {
          greeting: <Text color="green">Hello</Text>,
          name: <Text bold>Alice</Text>,
          place: <Text color="blue">CLI</Text>,
        }),
      );

      const output = lastFrame();
      expect(output).toContain('Hello');
      expect(output).toContain('Alice');
      expect(output).toContain('CLI');
      expect(output).toContain('welcome to');
    });

    it('should handle consecutive placeholders', () => {
      const { lastFrame } = render(
        renderStyledText('{first}{second}{third}', {
          first: <Text>A</Text>,
          second: <Text>B</Text>,
          third: <Text>C</Text>,
        }),
      );

      expect(lastFrame()).toContain('ABC');
    });

    it('should require all placeholders to have style mappings', () => {
      // Now that we have error detection, all placeholders must have mappings
      const { lastFrame } = render(
        renderStyledText('Use {valid} and {provided}', {
          valid: <Text bold>OK</Text>,
          provided: <Text>Found</Text>,
        }),
      );

      const output = lastFrame();
      expect(output).toContain('OK'); // {valid} -> OK
      expect(output).toContain('Found'); // {provided} -> Found
    });

    it('should handle empty placeholders', () => {
      const { lastFrame } = render(
        renderStyledText('Test {} and {empty}', {
          empty: <Text>Filled</Text>,
        }),
      );

      const output = lastFrame();
      expect(output).toContain('Test');
      expect(output).toContain('{}'); // Empty placeholder kept as-is
      expect(output).toContain('Filled');
    });

    it('should handle placeholders with special characters', () => {
      const { lastFrame } = render(
        renderStyledText('Use {symbol-1} and {key_2} and {number3}', {
          'symbol-1': <Text>Symbol</Text>,
          key_2: <Text>Key</Text>,
          number3: <Text>Number</Text>,
        }),
      );

      const output = lastFrame();
      expect(output).toContain('Symbol');
      expect(output).toContain('Key');
      expect(output).toContain('Number');
    });

    it('should handle nested braces correctly', () => {
      const { lastFrame } = render(
        renderStyledText('Code: {code} with escaped braces', {
          code: <Text bold>function() return true</Text>,
        }),
      );

      const output = lastFrame();
      expect(output).toContain('function() return true');
      expect(output).toContain('escaped braces');
    });

    it('should handle text with no placeholders', () => {
      const { lastFrame } = render(
        renderStyledText('Plain text with no placeholders', {}),
      );

      expect(lastFrame()).toContain('Plain text with no placeholders');
    });

    it('should handle only placeholders with no surrounding text', () => {
      const { lastFrame } = render(
        renderStyledText('{only}', {
          only: <Text bold>Placeholder</Text>,
        }),
      );

      expect(lastFrame()).toContain('Placeholder');
    });

    it('should handle complex real-world example', () => {
      const complexText =
        'Shell mode: Execute {type} commands via {symbol} (e.g., {example}) or use {method} (e.g. {natural}).';

      const { lastFrame } = render(
        renderStyledText(complexText, {
          type: <Text italic>shell</Text>,
          symbol: (
            <Text bold color="purple">
              !
            </Text>
          ),
          example: (
            <Text bold color="purple">
              !npm run start
            </Text>
          ),
          method: <Text italic>natural language</Text>,
          natural: <Text italic>start server</Text>,
        }),
      );

      const output = lastFrame();
      expect(output).toContain('Shell mode: Execute');
      expect(output).toContain('shell');
      expect(output).toContain('!');
      expect(output).toContain('!npm run start');
      expect(output).toContain('natural language');
      // Account for potential line wrapping in Ink terminal output
      expect(output).toContain('start');
      expect(output).toContain('server');
    });

    it('should handle debugging - check exact split behavior', () => {
      // This test helps us understand the regex split behavior
      const text = 'Test {missing} here';
      const { lastFrame } = render(
        renderStyledText(text, {
          missing: <Text>REPLACED</Text>,
        }),
      );

      const output = lastFrame();
      expect(output).toContain('Test');
      expect(output).toContain('REPLACED');
      expect(output).toContain('here');
      expect(output).not.toContain('{missing}');
    });
  });
});
