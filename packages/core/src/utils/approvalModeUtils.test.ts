/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ApprovalMode } from '../policy/types.js';
import {
  getApprovalModeDescription,
  getPlanModeExitMessage,
} from './approvalModeUtils.js';

describe('approvalModeUtils', () => {
  describe('getApprovalModeDescription', () => {
    it('should return correct description for DEFAULT mode', () => {
      expect(getApprovalModeDescription(ApprovalMode.DEFAULT)).toBe(
        'Default mode (edits will require confirmation)',
      );
    });

    it('should return correct description for AUTO_EDIT mode', () => {
      expect(getApprovalModeDescription(ApprovalMode.AUTO_EDIT)).toBe(
        'Auto-Edit mode (edits will be applied automatically)',
      );
    });

    it('should return correct description for PLAN mode', () => {
      expect(getApprovalModeDescription(ApprovalMode.PLAN)).toBe(
        'Plan mode (read-only planning)',
      );
    });

    it('should return correct description for YOLO mode', () => {
      expect(getApprovalModeDescription(ApprovalMode.YOLO)).toBe(
        'YOLO mode (all tool calls auto-approved)',
      );
    });
  });

  describe('getPlanModeExitMessage', () => {
    it('should return standard message when not manual', () => {
      expect(getPlanModeExitMessage(ApprovalMode.DEFAULT, false)).toBe(
        'Plan approved. Switching to Default mode (edits will require confirmation).',
      );
    });

    it('should return manual message when manual is true', () => {
      expect(getPlanModeExitMessage(ApprovalMode.AUTO_EDIT, true)).toBe(
        'User has manually exited Plan Mode. Switching to Auto-Edit mode (edits will be applied automatically).',
      );
    });

    it('should default to non-manual message', () => {
      expect(getPlanModeExitMessage(ApprovalMode.YOLO)).toBe(
        'Plan approved. Switching to YOLO mode (all tool calls auto-approved).',
      );
    });
  });
});
