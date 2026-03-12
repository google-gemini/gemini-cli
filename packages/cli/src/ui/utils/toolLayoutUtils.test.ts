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

    it('returns available space directly in constrained terminal (Standard mode)', () => {
      const availableTerminalHeight = 2; // Very small
      const result = calculateToolContentMaxLines({
        availableTerminalHeight,
        isAlternateBuffer: false,
      });

      // Math.max(0, 2 - 2) = 0
      expect(result).toBe(0);
    });

    it('returns available space directly in constrained terminal (ASB mode)', () => {
      const availableTerminalHeight = 4; // Very small
      const result = calculateToolContentMaxLines({
        availableTerminalHeight,
        isAlternateBuffer: true,
      });

      // Math.max(0, 4 - 2) = 2
      expect(result).toBe(2);
    });

    it('returns remaining space if sufficient space exists (Standard mode)', () => {
      const availableTerminalHeight = 20;
      const result = calculateToolContentMaxLines({
        availableTerminalHeight,
        isAlternateBuffer: false,
      });

      // Math.max(0, 20 - 2) = 18
      expect(result).toBe(18);
    });

    it('returns remaining space if sufficient space exists (ASB mode)', () => {
      const availableTerminalHeight = 20;
      const result = calculateToolContentMaxLines({
        availableTerminalHeight,
        isAlternateBuffer: true,
      });

      // Math.max(0, 20 - 2) = 18
      expect(result).toBe(18);
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

    it('returns ACTIVE_SHELL_MAX_LINES - SHELL_CONTENT_OVERHEAD for ASB mode when availableTerminalHeight is undefined', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Executing,
        isAlternateBuffer: true,
        isThisShellFocused: false,
        availableTerminalHeight: undefined,
        constrainHeight: true,
        isExpandable: false,
      });
      expect(result).toBe(ACTIVE_SHELL_MAX_LINES - SHELL_CONTENT_OVERHEAD);
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

    it('handles small availableTerminalHeight gracefully without overflow in Standard mode', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Executing,
        isAlternateBuffer: false,
        isThisShellFocused: false,
        availableTerminalHeight: 2,
        constrainHeight: true,
        isExpandable: false,
      });

      // Math.max(0, 2 - 2) = 0
      expect(result).toBe(0);
    });

    it('handles small availableTerminalHeight gracefully without overflow in ASB mode', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Executing,
        isAlternateBuffer: true,
        isThisShellFocused: false,
        availableTerminalHeight: 6,
        constrainHeight: true,
        isExpandable: false,
      });

      // Math.max(0, 6 - 2) = 4
      expect(result).toBe(4);
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

      // 30 - 2 = 28
      expect(result).toBe(28);
    });

    it('falls back to COMPLETED_SHELL_MAX_LINES - SHELL_CONTENT_OVERHEAD for completed shells if space allows', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Success,
        isAlternateBuffer: false,
        isThisShellFocused: false,
        availableTerminalHeight: 100,
        constrainHeight: true,
        isExpandable: false,
      });

      expect(result).toBe(COMPLETED_SHELL_MAX_LINES - SHELL_CONTENT_OVERHEAD);
    });

    it('falls back to ACTIVE_SHELL_MAX_LINES - SHELL_CONTENT_OVERHEAD for executing shells if space allows', () => {
      const result = calculateShellMaxLines({
        status: CoreToolCallStatus.Executing,
        isAlternateBuffer: false,
        isThisShellFocused: false,
        availableTerminalHeight: 100,
        constrainHeight: true,
        isExpandable: false,
      });

      expect(result).toBe(ACTIVE_SHELL_MAX_LINES - SHELL_CONTENT_OVERHEAD);
    });
  });
});
