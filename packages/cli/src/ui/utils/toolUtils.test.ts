/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { shouldHideToolCall } from './toolUtils.js';
import {
  ApprovalMode,
  ASK_USER_DISPLAY_NAME,
  WRITE_FILE_DISPLAY_NAME,
  EDIT_DISPLAY_NAME,
  READ_FILE_DISPLAY_NAME,
  GLOB_DISPLAY_NAME,
} from '@google/gemini-cli-core';
import { ToolCallStatus } from '../types.js';

describe('shouldHideToolCall', () => {
  it('should not hide irrelevant tools', () => {
    expect(
      shouldHideToolCall({
        displayName: 'other-tool',
        status: ToolCallStatus.Success,
        hasResultDisplay: true,
      }),
    ).toBe(false);
  });

  describe('Ask User logic', () => {
    it('should hide in-progress Ask User tools', () => {
      expect(
        shouldHideToolCall({
          displayName: ASK_USER_DISPLAY_NAME,
          status: ToolCallStatus.Pending,
          hasResultDisplay: false,
        }),
      ).toBe(true);
      expect(
        shouldHideToolCall({
          displayName: ASK_USER_DISPLAY_NAME,
          status: ToolCallStatus.Executing,
          hasResultDisplay: false,
        }),
      ).toBe(true);
      expect(
        shouldHideToolCall({
          displayName: ASK_USER_DISPLAY_NAME,
          status: ToolCallStatus.Confirming,
          hasResultDisplay: false,
        }),
      ).toBe(true);
    });

    it('should NOT hide completed Ask User tools with results', () => {
      expect(
        shouldHideToolCall({
          displayName: ASK_USER_DISPLAY_NAME,
          status: ToolCallStatus.Success,
          hasResultDisplay: true,
        }),
      ).toBe(false);
      expect(
        shouldHideToolCall({
          displayName: ASK_USER_DISPLAY_NAME,
          status: ToolCallStatus.Canceled,
          hasResultDisplay: true,
        }),
      ).toBe(false);
    });

    it('should hide Ask User errors without result display', () => {
      expect(
        shouldHideToolCall({
          displayName: ASK_USER_DISPLAY_NAME,
          status: ToolCallStatus.Error,
          hasResultDisplay: false,
        }),
      ).toBe(true);
    });

    it('should NOT hide Ask User errors WITH result display', () => {
      expect(
        shouldHideToolCall({
          displayName: ASK_USER_DISPLAY_NAME,
          status: ToolCallStatus.Error,
          hasResultDisplay: true,
        }),
      ).toBe(false);
    });
  });

  describe('Plan Mode logic', () => {
    it('should hide WriteFile and Edit in Plan Mode', () => {
      expect(
        shouldHideToolCall({
          displayName: WRITE_FILE_DISPLAY_NAME,
          status: ToolCallStatus.Success,
          approvalMode: ApprovalMode.PLAN,
          hasResultDisplay: true,
        }),
      ).toBe(true);
      expect(
        shouldHideToolCall({
          displayName: EDIT_DISPLAY_NAME,
          status: ToolCallStatus.Success,
          approvalMode: ApprovalMode.PLAN,
          hasResultDisplay: true,
        }),
      ).toBe(true);
    });

    it('should NOT hide WriteFile and Edit in non-Plan Mode', () => {
      expect(
        shouldHideToolCall({
          displayName: WRITE_FILE_DISPLAY_NAME,
          status: ToolCallStatus.Success,
          approvalMode: ApprovalMode.DEFAULT,
          hasResultDisplay: true,
        }),
      ).toBe(false);
      expect(
        shouldHideToolCall({
          displayName: EDIT_DISPLAY_NAME,
          status: ToolCallStatus.Success,
          approvalMode: ApprovalMode.AUTO_EDIT,
          hasResultDisplay: true,
        }),
      ).toBe(false);
    });

    it('should NOT hide other tools in Plan Mode', () => {
      expect(
        shouldHideToolCall({
          displayName: READ_FILE_DISPLAY_NAME,
          status: ToolCallStatus.Success,
          approvalMode: ApprovalMode.PLAN,
          hasResultDisplay: true,
        }),
      ).toBe(false);
      expect(
        shouldHideToolCall({
          displayName: GLOB_DISPLAY_NAME,
          status: ToolCallStatus.Success,
          approvalMode: ApprovalMode.PLAN,
          hasResultDisplay: true,
        }),
      ).toBe(false);
    });
  });
});
