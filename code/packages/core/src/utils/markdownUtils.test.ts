/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { jsonToMarkdown, safeJsonToMarkdown } from './markdownUtils.js';

describe('markdownUtils', () => {
  describe('jsonToMarkdown', () => {
    it('should handle primitives', () => {
      expect(jsonToMarkdown('hello')).toBe('hello');
      expect(jsonToMarkdown(123)).toBe('123');
      expect(jsonToMarkdown(true)).toBe('true');
      expect(jsonToMarkdown(null)).toBe('null');
      expect(jsonToMarkdown(undefined)).toBe('undefined');
    });

    it('should handle simple arrays', () => {
      const data = ['a', 'b', 'c'];
      expect(jsonToMarkdown(data)).toBe('- a\n- b\n- c');
    });

    it('should handle simple objects and convert camelCase to Space Case', () => {
      const data = { userName: 'Alice', userAge: 30 };
      expect(jsonToMarkdown(data)).toBe(
        '- **User Name**: Alice\n- **User Age**: 30',
      );
    });

    it('should handle empty structures', () => {
      expect(jsonToMarkdown([])).toBe('[]');
      expect(jsonToMarkdown({})).toBe('{}');
    });

    it('should handle nested structures with proper indentation', () => {
      const data = {
        userInfo: {
          fullName: 'Bob Smith',
          userRoles: ['admin', 'user'],
        },
        isActive: true,
      };
      const result = jsonToMarkdown(data);
      expect(result).toBe(
        '- **User Info**:\n' +
          '  - **Full Name**: Bob Smith\n' +
          '  - **User Roles**:\n' +
          '    - admin\n' +
          '    - user\n' +
          '- **Is Active**: true',
      );
    });

    it('should render tables for arrays of similar objects with Space Case keys', () => {
      const data = [
        { userId: 1, userName: 'Item 1' },
        { userId: 2, userName: 'Item 2' },
      ];
      const result = jsonToMarkdown(data);
      expect(result).toBe(
        '| User Id | User Name |\n| --- | --- |\n| 1 | Item 1 |\n| 2 | Item 2 |',
      );
    });

    it('should handle pipe characters, backslashes, and newlines in table data', () => {
      const data = [
        { colInfo: 'val|ue', otherInfo: 'line\nbreak', pathInfo: 'C:\\test' },
      ];
      const result = jsonToMarkdown(data);
      expect(result).toBe(
        '| Col Info | Other Info | Path Info |\n| --- | --- | --- |\n| val\\|ue | line break | C:\\\\test |',
      );
    });

    it('should fallback to lists for arrays with mixed objects', () => {
      const data = [
        { userId: 1, userName: 'Item 1' },
        { userId: 2, somethingElse: 'Item 2' },
      ];
      const result = jsonToMarkdown(data);
      expect(result).toContain('- **User Id**: 1');
      expect(result).toContain('- **Something Else**: Item 2');
    });

    it('should properly indent nested tables', () => {
      const data = {
        items: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
        ],
      };
      const result = jsonToMarkdown(data);
      const lines = result.split('\n');
      expect(lines[0]).toBe('- **Items**:');
      expect(lines[1]).toBe('  | Id | Name |');
      expect(lines[2]).toBe('  | --- | --- |');
      expect(lines[3]).toBe('  | 1 | A |');
      expect(lines[4]).toBe('  | 2 | B |');
    });

    it('should indent subsequent lines of multiline strings', () => {
      const data = {
        description: 'Line 1\nLine 2\nLine 3',
      };
      const result = jsonToMarkdown(data);
      expect(result).toBe('- **Description**: Line 1\n  Line 2\n  Line 3');
    });
  });

  describe('safeJsonToMarkdown', () => {
    it('should convert valid JSON', () => {
      const json = JSON.stringify({ keyName: 'value' });
      expect(safeJsonToMarkdown(json)).toBe('- **Key Name**: value');
    });

    it('should return original string for invalid JSON', () => {
      const notJson = 'Not a JSON string';
      expect(safeJsonToMarkdown(notJson)).toBe(notJson);
    });

    it('should handle plain strings that look like numbers or booleans but are valid JSON', () => {
      expect(safeJsonToMarkdown('123')).toBe('123');
      expect(safeJsonToMarkdown('true')).toBe('true');
    });
  });
});
