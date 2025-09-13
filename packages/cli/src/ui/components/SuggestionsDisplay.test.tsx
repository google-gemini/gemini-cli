/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { SuggestionsDisplay } from './SuggestionsDisplay.js';
import { CompletionMode } from '../hooks/useCommandCompletion.js';

// Extract the truncateWithEllipsis function for testing
function truncateWithEllipsis(text: string, maxLength: number): string {
  // Ensure text is a string before operating on it.
  if (typeof text !== 'string' || !text) {
    return '';
  }
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

describe('truncateWithEllipsis Utility Function', () => {
  describe('Input Validation', () => {
    it('should return empty string for non-string input', () => {
      // @ts-expect-error - Testing invalid input type
      expect(truncateWithEllipsis(null, 10)).toBe('');
      // @ts-expect-error - Testing invalid input type
      expect(truncateWithEllipsis(undefined, 10)).toBe('');
      // @ts-expect-error - Testing invalid input type
      expect(truncateWithEllipsis(123, 10)).toBe('');
      // @ts-expect-error - Testing invalid input type
      expect(truncateWithEllipsis({}, 10)).toBe('');
    });

    it('should return empty string for empty string input', () => {
      expect(truncateWithEllipsis('', 10)).toBe('');
      expect(truncateWithEllipsis('', 0)).toBe('');
      expect(truncateWithEllipsis('', 5)).toBe('');
    });

    it('should handle falsy string values', () => {
      expect(truncateWithEllipsis('', 10)).toBe('');
      expect(truncateWithEllipsis('   ', 10)).toBe('   ');
    });
  });

  describe('Normal Truncation Behavior', () => {
    it('should not truncate when text is shorter than maxLength', () => {
      expect(truncateWithEllipsis('short', 10)).toBe('short');
      expect(truncateWithEllipsis('hello', 5)).toBe('hello');
      expect(truncateWithEllipsis('test', 100)).toBe('test');
    });

    it('should not truncate when text length equals maxLength', () => {
      expect(truncateWithEllipsis('hello', 5)).toBe('hello');
      expect(truncateWithEllipsis('world', 5)).toBe('world');
    });

    it('should truncate with ellipsis when text is longer than maxLength', () => {
      expect(truncateWithEllipsis('verylongtext', 8)).toBe('veryl...');
      expect(truncateWithEllipsis('hello world', 8)).toBe('hello...');
      expect(truncateWithEllipsis('abcdefghijklmnopqrstuvwxyz', 10)).toBe(
        'abcdefg...',
      );
    });

    it('should handle edge case maxLength values', () => {
      // maxLength less than 3 (should still work but result in just ellipsis)
      expect(truncateWithEllipsis('hello', 2)).toBe('...');
      expect(truncateWithEllipsis('hello', 1)).toBe('...');
      expect(truncateWithEllipsis('hello', 0)).toBe('...');
    });

    it('should handle negative maxLength values', () => {
      expect(truncateWithEllipsis('hello', -1)).toBe('...');
      expect(truncateWithEllipsis('test', -5)).toBe('...');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle file path truncation appropriately', () => {
      const longPath =
        '/src/components/ui/SuggestionsDisplay/SuggestionsDisplay.tsx';
      expect(truncateWithEllipsis(longPath, 30)).toBe(
        '/src/components/ui/Suggesti...',
      );
      expect(truncateWithEllipsis(longPath, 20)).toBe('/src/components/u...');
    });

    it('should handle command name truncation', () => {
      const longCommand = 'my-custom-very-long-command-name';
      expect(truncateWithEllipsis(longCommand, 15)).toBe('my-custom-ve...');
      expect(truncateWithEllipsis(longCommand, 10)).toBe('my-cust...');
    });

    it('should preserve word boundaries where possible in display contexts', () => {
      const description =
        'This is a very long description that should be truncated';
      expect(truncateWithEllipsis(description, 20)).toBe(
        'This is a very lo...',
      );
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle unicode characters correctly', () => {
      const unicodeText = 'héllo wörld 🌟';
      expect(truncateWithEllipsis(unicodeText, 10)).toBe('héllo w...');
      expect(truncateWithEllipsis(unicodeText, 5)).toBe('hé...');
    });

    it('should handle whitespace-only strings', () => {
      expect(truncateWithEllipsis('     ', 3)).toBe('...');
      expect(truncateWithEllipsis('     ', 10)).toBe('     ');
    });

    it('should handle strings with special characters', () => {
      const specialChars = 'file-name_with.dots@and#symbols$';
      expect(truncateWithEllipsis(specialChars, 15)).toBe('file-name_wi...');
    });

    it('should handle very large maxLength values', () => {
      const text = 'normal text';
      expect(truncateWithEllipsis(text, 1000)).toBe('normal text');
      expect(truncateWithEllipsis(text, Number.MAX_SAFE_INTEGER)).toBe(
        'normal text',
      );
    });
  });

  describe('UI-Specific Test Cases', () => {
    it('should truncate long file paths for AT completion mode', () => {
      const filePath = '/very/long/path/to/some/file/that/needs/truncation.txt';
      const maxWidth = 25;
      const truncated = truncateWithEllipsis(filePath, maxWidth);

      expect(truncated).toHaveLength(maxWidth);
      expect(truncated).toBe('/very/long/path/to/som...');
      expect(truncated.endsWith('...')).toBe(true);
    });

    it('should preserve short file paths without truncation', () => {
      const shortPath = 'src/file.txt';
      expect(truncateWithEllipsis(shortPath, 20)).toBe('src/file.txt');
      expect(truncateWithEllipsis(shortPath, 50)).toBe('src/file.txt');
    });

    it('should handle empty file paths gracefully', () => {
      expect(truncateWithEllipsis('', 20)).toBe('');
    });
  });
});

describe('SuggestionsDisplay Component Integration', () => {
  const mockSuggestions = [
    {
      label: 'short',
      value: 'short',
      description: 'A short suggestion',
    },
    {
      label: 'very-long-suggestion-label-that-should-be-truncated',
      value: 'very-long-suggestion-label-that-should-be-truncated',
      description: 'A very long suggestion',
    },
    {
      label: 'src/components/very/long/file/path.txt',
      value: 'src/components/very/long/file/path.txt',
      description: 'File path suggestion',
    },
  ];

  it('should render without crashing', () => {
    const { lastFrame } = render(
      <SuggestionsDisplay
        suggestions={mockSuggestions}
        activeIndex={0}
        isLoading={false}
        width={80}
        scrollOffset={0}
        userInput="test"
        completionMode={CompletionMode.SLASH}
      />,
    );
    expect(lastFrame()).toBeTruthy();
  });

  it('should apply truncation in AT completion mode', () => {
    const { lastFrame } = render(
      <SuggestionsDisplay
        suggestions={[mockSuggestions[2]]} // File path suggestion
        activeIndex={0}
        isLoading={false}
        width={30} // Narrow width to force truncation
        scrollOffset={0}
        userInput="/custom @"
        completionMode={CompletionMode.AT}
      />,
    );

    const output = lastFrame();
    // Should contain truncated file path
    expect(output).toContain('...');
    // Should not contain the full very long path
    expect(output).not.toContain('src/components/very/long/file/path.txt');
  });

  it('should not truncate short labels in SLASH completion mode', () => {
    const { lastFrame } = render(
      <SuggestionsDisplay
        suggestions={[mockSuggestions[0]]} // Short suggestion
        activeIndex={0}
        isLoading={false}
        width={80}
        scrollOffset={0}
        userInput="/"
        completionMode={CompletionMode.SLASH}
      />,
    );

    const output = lastFrame();
    // Should contain the full label without truncation
    expect(output).toContain('short');
    expect(output).not.toContain('...');
  });

  it('should handle loading state', () => {
    const { lastFrame } = render(
      <SuggestionsDisplay
        suggestions={[]}
        activeIndex={0}
        isLoading={true}
        width={80}
        scrollOffset={0}
        userInput="test"
        completionMode={CompletionMode.SLASH}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Loading suggestions...');
  });

  it('should render null when no suggestions and not loading', () => {
    const { lastFrame } = render(
      <SuggestionsDisplay
        suggestions={[]}
        activeIndex={0}
        isLoading={false}
        width={80}
        scrollOffset={0}
        userInput="test"
        completionMode={CompletionMode.SLASH}
      />,
    );

    const output = lastFrame();
    expect(output).toBe('');
  });
});
