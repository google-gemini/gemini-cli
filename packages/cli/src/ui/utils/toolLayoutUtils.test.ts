/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  calculateToolContentMaxLines,
  calculateShellMaxLines,
  TOOL_RESULT_STATIC_HEIGHT,
  TOOL_RESULT_STANDARD_RESERVED_LINE_COUNT,
} from './toolLayoutUtils.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import {
  ACTIVE_SHELL_MAX_LINES,
  COMPLETED_SHELL_MAX_LINES,
} from '../constants.js';

describe('toolLayoutUtils', () => {
  describe('calculateToolContentMaxLines', () => {
    it('returns undefined if availableTerminalHeight is undefined', () => {
      const result = calculateToolContentMaxLines({
        availableTerminalHeight: undefined,
        isAlternateBuffer: false,
      });
      expect(result).toBeUndefined();
    });

    it('returns maxLinesLimit if maxLinesLimit applies but availableTerminalHeight is undefined', () => {
      const result = calculateToolContentMaxLines({
        availableTerminalHeight: undefined,
        isAlternateBuffer: false,
        maxLinesLimit: 10,
      });
      expect(result).toBe(10);
    });

    it('caps height to prevent overflow in constrained terminal (Standard mode)', () => {
      const availableTerminalHeight = 2; // Very small
      const result = calculateToolContentMaxLines({
        availableTerminalHeight,
        isAlternateBuffer: false,
      });

      // Math.max(0, 2 - 1 - 2) = 0
      expect(result).toBe(0);
    });

    it('caps height to prevent overflow in constrained terminal (ASB mode)', () => {
      const availableTerminalHeight = 4; // Very small
      const result = calculateToolContentMaxLines({
        availableTerminalHeight,
        isAlternateBuffer: true,
      });

      // Math.max(0, 4 - 1 - 6) = 0
      expect(result).toBe(0);
    });

    it('returns remaining space if sufficient space exists (Standard mode)', () => {
      const availableTerminalHeight = 20;
      const result = calculateToolContentMaxLines({
        availableTerminalHeight,
        isAlternateBuffer: false,
      });

      // Space remaining is 20 - 1 - 2 = 17
      expect(result).toBe(17);
    });

    it('returns remaining space if sufficient space exists (ASB mode)', () => {
      const availableTerminalHeight = 20;
      const result = calculateToolContentMaxLines({
        availableTerminalHeight,
        isAlternateBuffer: true,
      });

      // Space remaining is 20 - 1 - 6 = 13
      expect(result).toBe(13);
    });

    it('returns 0 if availableTerminalHeight is <= TOOL_RESULT_STATIC_HEIGHT + reservedLines', () => {
      const result = calculateToolContentMaxLines({
        availableTerminalHeight:
          TOOL_RESULT_STATIC_HEIGHT + TOOL_RESULT_STANDARD_RESERVED_LINE_COUNT,
        isAlternateBuffer: false,
      });

      // Cap at 3 - 1 - 2 = 0
      expect(result).toBe(0);
    });
  });

  describe('calculateShellMaxLines', () => {
    it('returns undefined when not constrained and is expandable', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Executing,
        isAlternateBuffer: false,
        isThisShellFocused: false,
        availableTerminalHeight: 20,
        constrainHeight: false,
        isExpandable: true,
      });
      expect(result).toBeUndefined();
    });

    it('returns ACTIVE_SHELL_MAX_LINES for ASB mode when availableTerminalHeight is undefined', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Executing,
        isAlternateBuffer: true,
        isThisShellFocused: false,
        availableTerminalHeight: undefined,
        constrainHeight: true,
        isExpandable: false,
      });
      expect(result).toBe(ACTIVE_SHELL_MAX_LINES);
    });

    it('returns undefined for Standard mode when availableTerminalHeight is undefined', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Executing,
        isAlternateBuffer: false,
        isThisShellFocused: false,
        availableTerminalHeight: undefined,
        constrainHeight: true,
        isExpandable: false,
      });
      expect(result).toBeUndefined();
    });

    it('handles small availableTerminalHeight gracefully to prevent overflow in Standard mode', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Executing,
        isAlternateBuffer: false,
        isThisShellFocused: false,
        availableTerminalHeight: 2, // Too small to subtract 1 + 2
        constrainHeight: true,
        isExpandable: false,
      });

      // Math.max(0, 2 - 1 - 2) = 0
      expect(result).toBe(0);
    });

    it('handles small availableTerminalHeight gracefully to prevent overflow in ASB mode', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Executing,
        isAlternateBuffer: true,
        isThisShellFocused: false,
        availableTerminalHeight: 6, // Too small to subtract 1 + 6
        constrainHeight: true,
        isExpandable: false,
      });

      // Math.max(0, 6 - 1 - 6) = 0
      expect(result).toBe(0);
    });

    it('handles negative availableTerminalHeight gracefully', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Executing,
        isAlternateBuffer: false,
        isThisShellFocused: false,
        availableTerminalHeight: -5,
        constrainHeight: true,
        isExpandable: false,
      });

      expect(result).toBe(0);
    });

    it('returns maxLinesBasedOnHeight for focused ASB shells', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Executing,
        isAlternateBuffer: true,
        isThisShellFocused: true,
        availableTerminalHeight: 30,
        constrainHeight: false,
        isExpandable: false,
      });

      // 30 - 1 (static) - 6 (ASB reserved) = 23
      expect(result).toBe(23);
    });

    it('falls back to COMPLETED_SHELL_MAX_LINES for completed shells if space allows', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Success,
        isAlternateBuffer: false,
        isThisShellFocused: false,
        availableTerminalHeight: 100,
        constrainHeight: true,
        isExpandable: false,
      });

      expect(result).toBe(COMPLETED_SHELL_MAX_LINES);
    });

    it('falls back to ACTIVE_SHELL_MAX_LINES for executing shells if space allows', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Executing,
        isAlternateBuffer: false,
        isThisShellFocused: false,
        availableTerminalHeight: 100,
        constrainHeight: true,
        isExpandable: false,
      });

      expect(result).toBe(ACTIVE_SHELL_MAX_LINES);
    });
  });
});
