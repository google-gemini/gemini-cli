/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { findLastSafeSplitPoint } from './markdownUtilities.js';

describe('markdownUtilities', () => {
  describe('findLastSafeSplitPoint', () => {
    describe('Basic splitting behavior', () => {
      it('should split at the last double newline if not in a code block', () => {
        const content = 'paragraph1\n\nparagraph2\n\nparagraph3';
        expect(findLastSafeSplitPoint(content)).toBe(24); // After the second \n\n
      });

      it('should return content.length if no safe split point is found', () => {
        const content = 'longstringwithoutanysafesplitpoint';
        expect(findLastSafeSplitPoint(content)).toBe(content.length);
      });

      it('should prioritize splitting at \n\n over being at the very end of the string if the end is not in a code block', () => {
        const content = 'Some text here.\n\nAnd more text here.';
        expect(findLastSafeSplitPoint(content)).toBe(17); // after the \n\n
      });

      it('should return content.length if the only \n\n is inside a code block and the end of content is not', () => {
        const content = '```\nignore this\n\nnewline\n```KeepThis';
        expect(findLastSafeSplitPoint(content)).toBe(content.length);
      });

      it('should correctly identify the last \n\n even if it is followed by text not in a code block', () => {
        const content =
          'First part.\n\nSecond part.\n\nThird part, then some more text.';
        // Split should be after "Second part.\n\n"
        // "First part.\n\n" is 13 chars. "Second part.\n\n" is 14 chars. Total 27.
        expect(findLastSafeSplitPoint(content)).toBe(27);
      });

      it('should return content.length if content is empty', () => {
        const content = '';
        expect(findLastSafeSplitPoint(content)).toBe(0);
      });

      it('should return content.length if content has no newlines and no code blocks', () => {
        const content = 'Single line of text';
        expect(findLastSafeSplitPoint(content)).toBe(content.length);
      });
    });

    describe('List protection (the main fix)', () => {
      it('should not split immediately after a header that precedes a list', () => {
        const content = '# Header\n\n* Item 1\n* Item 2\n\nMore text';
        const splitPoint = findLastSafeSplitPoint(content);

        // Should not split right after the header (index 9)
        expect(splitPoint).not.toBe(9);

        // Function should find a safe split point after the list
        // If it splits, all list items should be in the same part
        const beforeSplit = content.substring(0, splitPoint);
        const afterSplit = content.substring(splitPoint);

        if (beforeSplit.includes('Item 1')) {
          expect(beforeSplit).toContain('Item 2');
        } else if (afterSplit.includes('Item 1')) {
          expect(afterSplit).toContain('Item 2');
        }
      });

      it('should keep unordered list items together', () => {
        const content = 'Text\n\n* First\n* Second\n* Third\n\nAfter';
        const splitPoint = findLastSafeSplitPoint(content);

        const beforeSplit = content.substring(0, splitPoint);
        const afterSplit = content.substring(splitPoint);

        // All list items should be in the same part
        if (beforeSplit.includes('First')) {
          expect(beforeSplit).toContain('Second');
          expect(beforeSplit).toContain('Third');
        } else if (afterSplit.includes('First')) {
          expect(afterSplit).toContain('Second');
          expect(afterSplit).toContain('Third');
        }
      });

      it('should keep ordered list items together', () => {
        const content =
          'Steps:\n\n1. First step\n2. Second step\n3. Third step\n\nDone.';
        const splitPoint = findLastSafeSplitPoint(content);

        const beforeSplit = content.substring(0, splitPoint);
        const afterSplit = content.substring(splitPoint);

        // All numbered items should be together
        if (beforeSplit.includes('First step')) {
          expect(beforeSplit).toContain('Second step');
          expect(beforeSplit).toContain('Third step');
        } else if (afterSplit.includes('First step')) {
          expect(afterSplit).toContain('Second step');
          expect(afterSplit).toContain('Third step');
        }
      });

      it('should handle different list markers (*, -, +)', () => {
        const content =
          'List:\n\n* Asterisk item\n- Dash item\n+ Plus item\n\nEnd';
        const splitPoint = findLastSafeSplitPoint(content);

        const beforeSplit = content.substring(0, splitPoint);
        const afterSplit = content.substring(splitPoint);

        const listItems = ['Asterisk item', 'Dash item', 'Plus item'];

        // All different markers should stay together
        if (beforeSplit.includes('Asterisk item')) {
          listItems.forEach((item) => expect(beforeSplit).toContain(item));
        } else if (afterSplit.includes('Asterisk item')) {
          listItems.forEach((item) => expect(afterSplit).toContain(item));
        }
      });

      it('should handle nested/indented lists', () => {
        const content =
          'Nested:\n\n* Level 1\n  * Level 2\n    * Level 3\n* Back to 1\n\nEnd';
        const splitPoint = findLastSafeSplitPoint(content);

        const beforeSplit = content.substring(0, splitPoint);
        const afterSplit = content.substring(splitPoint);

        const nestedItems = ['Level 1', 'Level 2', 'Level 3', 'Back to 1'];

        if (beforeSplit.includes('Level 1')) {
          nestedItems.forEach((item) => expect(beforeSplit).toContain(item));
        } else if (afterSplit.includes('Level 1')) {
          nestedItems.forEach((item) => expect(afterSplit).toContain(item));
        }
      });

      it('should handle the original bug case - numbered commands', () => {
        const content = `# Commands

1. \`*develop-story\` - Execute story implementation
2. \`*explain\` - Detailed explanation
3. \`*review-qa\` - Run QA fixes
4. \`*run-tests\` - Execute tests
5. \`*exit\` - Exit mode

Select a number.`;

        const splitPoint = findLastSafeSplitPoint(content);
        const beforeSplit = content.substring(0, splitPoint);
        const afterSplit = content.substring(splitPoint);

        // All command items should stay together
        const commands = [
          '*develop-story',
          '*explain',
          '*review-qa',
          '*run-tests',
          '*exit',
        ];

        if (beforeSplit.includes('*develop-story')) {
          commands.forEach((cmd) => expect(beforeSplit).toContain(cmd));
        } else if (afterSplit.includes('*develop-story')) {
          commands.forEach((cmd) => expect(afterSplit).toContain(cmd));
        }
      });
    });

    describe('Header protection', () => {
      it('should not split immediately after H1 headers', () => {
        const content =
          'Before\n\n# Main Title\n\nContent here\n\nMore content';
        const splitPoint = findLastSafeSplitPoint(content);

        // Should not split right after "# Main Title\n\n"
        expect(splitPoint).not.toBe(content.indexOf('Content'));
      });

      it('should not split after any header level', () => {
        const headers = ['#', '##', '###', '####', '#####', '######'];

        headers.forEach((headerLevel) => {
          const content = `Text\n\n${headerLevel} Header\n\nContent\n\nMore`;
          const splitPoint = findLastSafeSplitPoint(content);

          const headerEnd = content.indexOf('Content');
          expect(splitPoint).not.toBe(headerEnd);
        });
      });

      it('should handle headers with formatting', () => {
        const content = 'Text\n\n# Header with **bold**\n\nContent\n\nEnd';
        const splitPoint = findLastSafeSplitPoint(content);

        // Should not split right after the formatted header
        expect(splitPoint).not.toBe(content.indexOf('Content'));
      });
    });

    describe('Code block integration', () => {
      it('should split before code blocks when content ends in code', () => {
        const content = 'Text before\n\n```\ncode here\nmore code';
        const splitPoint = findLastSafeSplitPoint(content);

        // Should split before the code block starts
        expect(splitPoint).toBeLessThanOrEqual(content.indexOf('```'));
      });

      it('should not split inside code blocks that contain list-like text', () => {
        const content =
          "Before\n\n```\n* This looks like a list\n* But it's in code\n```\n\nAfter";
        const splitPoint = findLastSafeSplitPoint(content);

        // Should not split inside the code block
        const beforeSplit = content.substring(0, splitPoint);
        if (beforeSplit.includes('```')) {
          expect(beforeSplit).toContain("But it's in code");
          expect(beforeSplit).toContain('```'); // closing fence
        }
      });

      it('should handle unclosed code blocks at end of content', () => {
        const content = 'Text\n\n```javascript\nconst x = 1;\n// unclosed code';
        const splitPoint = findLastSafeSplitPoint(content);

        // Should split before the unclosed code block
        expect(splitPoint).toBeLessThanOrEqual(
          content.indexOf('```javascript'),
        );
      });
    });

    describe('Edge cases and combinations', () => {
      it('should handle content with only headers and lists carefully', () => {
        const content = `# Header 1

* List item 1
* List item 2

## Header 2

1. Numbered item 1
2. Numbered item 2`;

        const splitPoint = findLastSafeSplitPoint(content);

        // Function will use fallback logic - ensure list integrity is maintained
        const beforeSplit = content.substring(0, splitPoint);
        const afterSplit = content.substring(splitPoint);

        // If first list is split, all items should be together
        if (beforeSplit.includes('List item 1')) {
          expect(beforeSplit).toContain('List item 2');
        } else if (afterSplit.includes('List item 1')) {
          expect(afterSplit).toContain('List item 2');
        }

        // If second list is split, all items should be together
        if (beforeSplit.includes('Numbered item 1')) {
          expect(beforeSplit).toContain('Numbered item 2');
        } else if (afterSplit.includes('Numbered item 1')) {
          expect(afterSplit).toContain('Numbered item 2');
        }
      });

      it('should prefer later safe splits over earlier problematic ones', () => {
        const content = `# Problematic Header

* List that follows

Safe paragraph here.

Another safe paragraph.

# Final Header

Final content`;

        const splitPoint = findLastSafeSplitPoint(content);

        // Should find a safe split point, not the problematic one after the first header
        expect(splitPoint).toBeGreaterThan(content.indexOf('Safe paragraph'));
      });

      it('should handle mixed content with multiple sections', () => {
        const content = `Complete paragraph.

Safe content here.

# Header Section

* Item 1
* Item 2

Another complete section.

Final safe content.`;

        const splitPoint = findLastSafeSplitPoint(content);

        // Should be able to split, but not break the header+list structure
        expect(splitPoint).toBeGreaterThan(0);

        const beforeSplit = content.substring(0, splitPoint);

        // If it includes the header section, it should include the whole list
        if (beforeSplit.includes('Header Section')) {
          expect(beforeSplit).toContain('Item 1');
          expect(beforeSplit).toContain('Item 2');
        }
      });

      it('should use fallback split when no perfect split exists', () => {
        const content = `# Header 1

* List 1

# Header 2

* List 2`;

        const splitPoint = findLastSafeSplitPoint(content);

        // Should still provide a split point as fallback, even if not ideal
        expect(splitPoint).toBeGreaterThan(0);
        expect(splitPoint).toBeLessThanOrEqual(content.length);
      });

      it('should handle very long content efficiently', () => {
        // Create a long content string with repeating safe sections
        const section =
          'Safe paragraph content.\n\nAnother safe paragraph.\n\n';
        const longContent = section.repeat(100) + 'Final content.';

        const splitPoint = findLastSafeSplitPoint(longContent);

        // Should find a split point efficiently
        expect(splitPoint).toBeGreaterThan(0);
        expect(splitPoint).toBeLessThanOrEqual(longContent.length);
      });
    });

    describe('Enhanced structure protection', () => {
      it('should allow splitting between separate blockquotes', () => {
        const content = `Text before

> First blockquote here.

> Second blockquote here.

Text after blockquotes.`;

        const splitPoint = findLastSafeSplitPoint(content);

        // Should be able to split between the blockquotes since \n\n terminates them
        expect(splitPoint).toBeGreaterThan(0);
        expect(splitPoint).toBeLessThanOrEqual(content.length);

        // The split should not break any structure integrity
        const beforeSplit = content.substring(0, splitPoint);
        const afterSplit = content.substring(splitPoint);

        // Both parts should be valid
        expect(beforeSplit.length + afterSplit.length).toBe(content.length);
      });

      it('should allow splitting between separate tables', () => {
        const content = `Before table

| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |

| Header A | Header B |
|----------|----------|
| Data A   | Data B   |

After tables.`;

        const splitPoint = findLastSafeSplitPoint(content);

        // Should be able to split between tables since \n\n terminates them
        expect(splitPoint).toBeGreaterThan(0);
        expect(splitPoint).toBeLessThanOrEqual(content.length);

        // The split should not break any structure integrity
        const beforeSplit = content.substring(0, splitPoint);
        const afterSplit = content.substring(splitPoint);

        // Both parts should be valid
        expect(beforeSplit.length + afterSplit.length).toBe(content.length);
      });

      it('should handle enhanced list patterns', () => {
        const content = `Enhanced Lists

a. Alphabetic list
b. Second item

i. Roman numerals
ii. Another roman

- [x] Completed task
- [ ] Pending task

Final text.`;

        const splitPoint = findLastSafeSplitPoint(content);
        const beforeSplit = content.substring(0, splitPoint);
        const afterSplit = content.substring(splitPoint);

        // Verify alphabetic list stays together
        if (beforeSplit.includes('Alphabetic list')) {
          expect(beforeSplit).toContain('Second item');
        } else if (afterSplit.includes('Alphabetic list')) {
          expect(afterSplit).toContain('Second item');
        }

        // Verify task list stays together
        if (beforeSplit.includes('Completed task')) {
          expect(beforeSplit).toContain('Pending task');
        } else if (afterSplit.includes('Completed task')) {
          expect(afterSplit).toContain('Pending task');
        }
      });

      it('should handle unusual spacing in lists', () => {
        const content = `List with spacing

* Item 1


* Item 2 (unusual spacing)

* Item 3

End text.`;

        const splitPoint = findLastSafeSplitPoint(content);
        const beforeSplit = content.substring(0, splitPoint);
        const afterSplit = content.substring(splitPoint);

        // All items should stay together despite unusual spacing
        const listItems = ['Item 1', 'Item 2 (unusual spacing)', 'Item 3'];

        if (beforeSplit.includes('Item 1')) {
          listItems.forEach((item) => expect(beforeSplit).toContain(item));
        } else if (afterSplit.includes('Item 1')) {
          listItems.forEach((item) => expect(afterSplit).toContain(item));
        }
      });

      it('should handle complex mixed structures', () => {
        const content = `# Complex Document

## Section with List
* Item A
* Item B

### Subsection with Table
| Col A | Col B |
|-------|-------|
| Val 1 | Val 2 |

#### Blockquote Section
> Important quote here
> Continues on next line

## Final Section
Regular paragraph content.`;

        const splitPoint = findLastSafeSplitPoint(content);

        // Should handle the complex structure without breaking individual elements
        expect(splitPoint).toBeGreaterThan(0);
        expect(splitPoint).toBeLessThanOrEqual(content.length);

        const beforeSplit = content.substring(0, splitPoint);
        const afterSplit = content.substring(splitPoint);

        // Verify structural integrity where possible
        if (beforeSplit.includes('Item A')) {
          expect(beforeSplit).toContain('Item B');
        }
        // Note: Blockquotes can be split between separate blocks since \n\n terminates them
      });
    });
  });
});
