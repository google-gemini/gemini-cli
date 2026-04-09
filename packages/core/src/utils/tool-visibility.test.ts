/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import {
  isRenderedInHistory,
  requiresUserConfirmation,
  isVisibleInToolGroup,
} from './tool-visibility.js';
import { CoreToolCallStatus } from '../scheduler/types.js';
import { ApprovalMode } from '../policy/types.js';
import {
  ASK_USER_DISPLAY_NAME,
  WRITE_FILE_DISPLAY_NAME,
  EDIT_DISPLAY_NAME,
  UPDATE_TOPIC_TOOL_NAME,
  READ_FILE_DISPLAY_NAME,
} from '../tools/tool-names.js';

describe('ToolVisibility Rules', () => {
  const createCtx = (overrides = {}) => ({
    name: 'some_tool',
    displayName: 'Some Tool',
    status: CoreToolCallStatus.Success,
    hasResult: true,
    hasParent: false,
    isClientInitiated: false,
    ...overrides,
  });

  describe('isRenderedInHistory', () => {
    it('hides tools with parents', () => {
      expect(isRenderedInHistory(createCtx({ hasParent: true }))).toBe(false);
    });

    it('hides AskUser errors without results', () => {
      expect(
        isRenderedInHistory(
          createCtx({
            displayName: ASK_USER_DISPLAY_NAME,
            status: CoreToolCallStatus.Error,
            hasResult: false,
          }),
        ),
      ).toBe(false);
    });

    it('shows AskUser success', () => {
      expect(
        isRenderedInHistory(
          createCtx({
            displayName: ASK_USER_DISPLAY_NAME,
            status: CoreToolCallStatus.Success,
          }),
        ),
      ).toBe(true);
    });

    it('hides WriteFile/Edit in Plan Mode', () => {
      expect(
        isRenderedInHistory(
          createCtx({
            displayName: WRITE_FILE_DISPLAY_NAME,
            approvalMode: ApprovalMode.PLAN,
          }),
        ),
      ).toBe(false);
      expect(
        isRenderedInHistory(
          createCtx({
            displayName: EDIT_DISPLAY_NAME,
            approvalMode: ApprovalMode.PLAN,
          }),
        ),
      ).toBe(false);
    });

    it('shows ReadFile in Plan Mode', () => {
      expect(
        isRenderedInHistory(
          createCtx({
            displayName: READ_FILE_DISPLAY_NAME,
            approvalMode: ApprovalMode.PLAN,
          }),
        ),
      ).toBe(true);
    });
  });

  describe('requiresUserConfirmation', () => {
    it('returns false for update_topic', () => {
      expect(
        requiresUserConfirmation(createCtx({ name: UPDATE_TOPIC_TOOL_NAME })),
      ).toBe(false);
    });

    it('returns true for standard tools', () => {
      expect(requiresUserConfirmation(createCtx({ name: 'write_file' }))).toBe(
        true,
      );
    });
  });

  describe('isVisibleInToolGroup', () => {
    it('returns false if not rendered in history', () => {
      expect(isVisibleInToolGroup(createCtx({ hasParent: true }), 'full')).toBe(
        false,
      );
    });

    it('hides non-client-initiated errors on low verbosity', () => {
      expect(
        isVisibleInToolGroup(
          createCtx({
            status: CoreToolCallStatus.Error,
            isClientInitiated: false,
          }),
          'low',
        ),
      ).toBe(false);
    });

    it('shows non-client-initiated errors on full verbosity', () => {
      expect(
        isVisibleInToolGroup(
          createCtx({
            status: CoreToolCallStatus.Error,
            isClientInitiated: false,
          }),
          'full',
        ),
      ).toBe(true);
    });

    it('hides confirming tools', () => {
      expect(
        isVisibleInToolGroup(
          createCtx({ status: CoreToolCallStatus.AwaitingApproval }),
          'full',
        ),
      ).toBe(false);
    });

    it('hides AskUser while in progress', () => {
      expect(
        isVisibleInToolGroup(
          createCtx({
            displayName: ASK_USER_DISPLAY_NAME,
            status: CoreToolCallStatus.Executing,
          }),
          'full',
        ),
      ).toBe(false);
    });
  });
});
