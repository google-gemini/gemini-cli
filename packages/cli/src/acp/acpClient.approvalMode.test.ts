/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { Session } from './acpClient.js';
import { ApprovalMode, type Config } from '@google/gemini-cli-core';
import type * as acp from '@agentclientprotocol/sdk';
import type { LoadedSettings } from '../config/settings.js';

/**
 * Builds a minimal Session for testing setMode() in isolation.
 * All constructor args except `config` are stubbed out — they are not
 * exercised by the paths under test.
 */
function makeSession(opts: {
  approvalModeExplicit: boolean;
  currentMode: ApprovalMode;
}) {
  const setApprovalMode = vi.fn();
  const config = {
    isPlanEnabled: vi.fn().mockReturnValue(false),
    isApprovalModeExplicit: vi.fn().mockReturnValue(opts.approvalModeExplicit),
    setApprovalMode,
    getApprovalMode: vi.fn().mockReturnValue(opts.currentMode),
  } as unknown as Config;

  const session = new Session(
    'test-session-id',
    {} as never,
    config,
    {} as never,
    {} as unknown as LoadedSettings,
  );

  return { session, setApprovalMode, config };
}

describe('Session.setMode — CLI approval mode precedence', () => {
  describe('when no CLI flag was set (approvalModeExplicit = false)', () => {
    it('applies the IDE-pushed yolo mode', () => {
      const { session, setApprovalMode } = makeSession({
        approvalModeExplicit: false,
        currentMode: ApprovalMode.DEFAULT,
      });

      session.setMode(ApprovalMode.YOLO as unknown as acp.SessionModeId);

      expect(setApprovalMode).toHaveBeenCalledWith(ApprovalMode.YOLO);
    });

    it('applies auto_edit mode from IDE', () => {
      const { session, setApprovalMode } = makeSession({
        approvalModeExplicit: false,
        currentMode: ApprovalMode.DEFAULT,
      });

      session.setMode(ApprovalMode.AUTO_EDIT as unknown as acp.SessionModeId);

      expect(setApprovalMode).toHaveBeenCalledWith(ApprovalMode.AUTO_EDIT);
    });
  });

  describe('when CLI flag was explicitly set (approvalModeExplicit = true)', () => {
    it('does NOT apply IDE-pushed default when --yolo was passed', () => {
      const { session, setApprovalMode } = makeSession({
        approvalModeExplicit: true,
        currentMode: ApprovalMode.YOLO,
      });

      // VS Code companion sends its stored default on connect — must be ignored
      session.setMode(ApprovalMode.DEFAULT as unknown as acp.SessionModeId);

      expect(setApprovalMode).not.toHaveBeenCalled();
    });

    it('does NOT apply any IDE mode when --approval-mode was passed', () => {
      const { session, setApprovalMode } = makeSession({
        approvalModeExplicit: true,
        currentMode: ApprovalMode.AUTO_EDIT,
      });

      session.setMode(ApprovalMode.DEFAULT as unknown as acp.SessionModeId);

      expect(setApprovalMode).not.toHaveBeenCalled();
    });

    it('returns empty response object in both code paths', () => {
      const { session: s1 } = makeSession({
        approvalModeExplicit: false,
        currentMode: ApprovalMode.DEFAULT,
      });
      const { session: s2 } = makeSession({
        approvalModeExplicit: true,
        currentMode: ApprovalMode.YOLO,
      });

      expect(
        s1.setMode(ApprovalMode.YOLO as unknown as acp.SessionModeId),
      ).toEqual({});
      expect(
        s2.setMode(ApprovalMode.DEFAULT as unknown as acp.SessionModeId),
      ).toEqual({});
    });
  });

  describe('invalid mode', () => {
    it('throws for an unrecognised mode id regardless of CLI flag', () => {
      const { session: s1 } = makeSession({
        approvalModeExplicit: false,
        currentMode: ApprovalMode.DEFAULT,
      });
      const { session: s2 } = makeSession({
        approvalModeExplicit: true,
        currentMode: ApprovalMode.YOLO,
      });

      expect(() => s1.setMode('not_a_mode' as acp.SessionModeId)).toThrow(
        'Invalid or unavailable mode',
      );
      expect(() => s2.setMode('not_a_mode' as acp.SessionModeId)).toThrow(
        'Invalid or unavailable mode',
      );
    });
  });
});
