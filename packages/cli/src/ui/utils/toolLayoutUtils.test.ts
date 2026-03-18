/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  calculateToolContentMaxLines,
  calculateShellMaxLines,
  SHELL_CONTENT_OVERHEAD,
} from './toolLayoutUtils.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import {
  ACTIVE_SHELL_MAX_LINES,
  COMPLETED_SHELL_MAX_LINES,
} from '../constants.js';

describe('toolLayoutUtils', () => {
  describe('calculateToolContentMaxLines', () => {
    interface CalculateToolContentMaxLinesTestCase {
      desc: string;
      options: Parameters<typeof calculateToolContentMaxLines>[0];
      expected: number | undefined;
    }

    const testCases: CalculateToolContentMaxLinesTestCase[] = [
      {
        desc: 'returns undefined if availableTerminalHeight is undefined',
        options: {
          availableTerminalHeight: undefined,
          isAlternateBuffer: false,
        },
        expected: undefined,
      },
      {
        desc: 'returns maxLinesLimit if maxLinesLimit applies but availableTerminalHeight is undefined',
        options: {
          availableTerminalHeight: undefined,
          isAlternateBuffer: false,
          maxLinesLimit: 10,
        },
        expected: 10,
      },
      {
        desc: 'returns available space directly in constrained terminal (Standard mode)',
        options: {
          availableTerminalHeight: 2,
          isAlternateBuffer: false,
        },
        expected: 3,
      },
      {
        desc: 'returns available space directly in constrained terminal (ASB mode)',
        options: {
          availableTerminalHeight: 4,
          isAlternateBuffer: true,
        },
        expected: 3,
      },
      {
        desc: 'returns remaining space if sufficient space exists (Standard mode)',
        options: {
          availableTerminalHeight: 20,
          isAlternateBuffer: false,
        },
        expected: 17,
      },
      {
        desc: 'returns remaining space if sufficient space exists (ASB mode)',
        options: {
          availableTerminalHeight: 20,
          isAlternateBuffer: true,
        },
        expected: 13,
      },
    ];

    it.each(testCases)('$desc', ({ options, expected }) => {
      const result = calculateToolContentMaxLines(options);
      expect(result).toBe(expected);
    });
  });

  describe('calculateShellMaxLines', () => {
    interface CalculateShellMaxLinesTestCase {
      desc: string;
      options: Parameters<typeof calculateShellMaxLines>[0];
      expected: number | undefined;
    }

    const testCases: CalculateShellMaxLinesTestCase[] = [
      {
        desc: 'returns undefined when not constrained and is expandable',
        options: {
          status: CoreToolCallStatus.Executing,
          isAlternateBuffer: false,
          isThisShellFocused: false,
          availableTerminalHeight: 20,
          constrainHeight: false,
          isExpandable: true,
        },
        expected: undefined,
      },
      {
        desc: 'returns ACTIVE_SHELL_MAX_LINES - SHELL_CONTENT_OVERHEAD for ASB mode when availableTerminalHeight is undefined',
        options: {
          status: CoreToolCallStatus.Executing,
          isAlternateBuffer: true,
          isThisShellFocused: false,
          availableTerminalHeight: undefined,
          constrainHeight: true,
          isExpandable: false,
        },
        expected: ACTIVE_SHELL_MAX_LINES - SHELL_CONTENT_OVERHEAD,
      },
      {
        desc: 'returns undefined for Standard mode when availableTerminalHeight is undefined',
        options: {
          status: CoreToolCallStatus.Executing,
          isAlternateBuffer: false,
          isThisShellFocused: false,
          availableTerminalHeight: undefined,
          constrainHeight: true,
          isExpandable: false,
        },
        expected: undefined,
      },
      {
        desc: 'handles small availableTerminalHeight gracefully without overflow in Standard mode',
        options: {
          status: CoreToolCallStatus.Executing,
          isAlternateBuffer: false,
          isThisShellFocused: false,
          availableTerminalHeight: 2,
          constrainHeight: true,
          isExpandable: false,
        },
        expected: 1,
      },
      {
        desc: 'handles small availableTerminalHeight gracefully without overflow in ASB mode',
        options: {
          status: CoreToolCallStatus.Executing,
          isAlternateBuffer: true,
          isThisShellFocused: false,
          availableTerminalHeight: 6,
          constrainHeight: true,
          isExpandable: false,
        },
        expected: 4,
      },
      {
        desc: 'handles negative availableTerminalHeight gracefully',
        options: {
          status: CoreToolCallStatus.Executing,
          isAlternateBuffer: false,
          isThisShellFocused: false,
          availableTerminalHeight: -5,
          constrainHeight: true,
          isExpandable: false,
        },
        expected: 1,
      },
      {
        desc: 'returns maxLinesBasedOnHeight for focused ASB shells',
        options: {
          status: CoreToolCallStatus.Executing,
          isAlternateBuffer: true,
          isThisShellFocused: true,
          availableTerminalHeight: 30,
          constrainHeight: false,
          isExpandable: false,
        },
        expected: 28,
      },
      {
        desc: 'falls back to COMPLETED_SHELL_MAX_LINES - SHELL_CONTENT_OVERHEAD for completed shells if space allows',
        options: {
          status: CoreToolCallStatus.Success,
          isAlternateBuffer: false,
          isThisShellFocused: false,
          availableTerminalHeight: 100,
          constrainHeight: true,
          isExpandable: false,
        },
        expected: COMPLETED_SHELL_MAX_LINES - SHELL_CONTENT_OVERHEAD,
      },
      {
        desc: 'falls back to ACTIVE_SHELL_MAX_LINES - SHELL_CONTENT_OVERHEAD for executing shells if space allows',
        options: {
          status: CoreToolCallStatus.Executing,
          isAlternateBuffer: false,
          isThisShellFocused: false,
          availableTerminalHeight: 100,
          constrainHeight: true,
          isExpandable: false,
        },
        expected: ACTIVE_SHELL_MAX_LINES - SHELL_CONTENT_OVERHEAD,
      },
    ];

    it.each(testCases)('$desc', ({ options, expected }) => {
      const result = calculateShellMaxLines(options);
      expect(result).toBe(expected);
    });
  });
});
