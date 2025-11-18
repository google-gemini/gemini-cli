/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ToolConfirmationOutcome } from '../tools/tools.js';
import {
  ToolCallDecision,
  getDecisionFromOutcome,
} from './tool-call-decision.js';

describe('tool-call-decision', () => {
  describe('ToolCallDecision enum', () => {
    it('should have ACCEPT decision', () => {
      expect(ToolCallDecision.ACCEPT).toBe('accept');
    });

    it('should have REJECT decision', () => {
      expect(ToolCallDecision.REJECT).toBe('reject');
    });

    it('should have MODIFY decision', () => {
      expect(ToolCallDecision.MODIFY).toBe('modify');
    });

    it('should have AUTO_ACCEPT decision', () => {
      expect(ToolCallDecision.AUTO_ACCEPT).toBe('auto_accept');
    });

    it('should have exactly 4 decision types', () => {
      const decisionKeys = Object.keys(ToolCallDecision);
      expect(decisionKeys).toHaveLength(4);
    });

    it('should use snake_case for multi-word values', () => {
      expect(ToolCallDecision.AUTO_ACCEPT).toMatch(/_/);
    });
  });

  describe('getDecisionFromOutcome', () => {
    describe('ACCEPT mapping', () => {
      it('should map ProceedOnce to ACCEPT', () => {
        const result = getDecisionFromOutcome(
          ToolConfirmationOutcome.ProceedOnce,
        );
        expect(result).toBe(ToolCallDecision.ACCEPT);
      });
    });

    describe('AUTO_ACCEPT mapping', () => {
      it('should map ProceedAlways to AUTO_ACCEPT', () => {
        const result = getDecisionFromOutcome(
          ToolConfirmationOutcome.ProceedAlways,
        );
        expect(result).toBe(ToolCallDecision.AUTO_ACCEPT);
      });

      it('should map ProceedAlwaysServer to AUTO_ACCEPT', () => {
        const result = getDecisionFromOutcome(
          ToolConfirmationOutcome.ProceedAlwaysServer,
        );
        expect(result).toBe(ToolCallDecision.AUTO_ACCEPT);
      });

      it('should map ProceedAlwaysTool to AUTO_ACCEPT', () => {
        const result = getDecisionFromOutcome(
          ToolConfirmationOutcome.ProceedAlwaysTool,
        );
        expect(result).toBe(ToolCallDecision.AUTO_ACCEPT);
      });
    });

    describe('MODIFY mapping', () => {
      it('should map ModifyWithEditor to MODIFY', () => {
        const result = getDecisionFromOutcome(
          ToolConfirmationOutcome.ModifyWithEditor,
        );
        expect(result).toBe(ToolCallDecision.MODIFY);
      });
    });

    describe('REJECT mapping', () => {
      it('should map Cancel to REJECT', () => {
        const result = getDecisionFromOutcome(ToolConfirmationOutcome.Cancel);
        expect(result).toBe(ToolCallDecision.REJECT);
      });

      it('should map undefined outcome to REJECT (default case)', () => {
        const result = getDecisionFromOutcome(undefined as never);
        expect(result).toBe(ToolCallDecision.REJECT);
      });
    });

    describe('comprehensive coverage', () => {
      it('should map all ToolConfirmationOutcome values', () => {
        const outcomes = [
          ToolConfirmationOutcome.ProceedOnce,
          ToolConfirmationOutcome.ProceedAlways,
          ToolConfirmationOutcome.ProceedAlwaysServer,
          ToolConfirmationOutcome.ProceedAlwaysTool,
          ToolConfirmationOutcome.ModifyWithEditor,
          ToolConfirmationOutcome.Cancel,
        ];

        outcomes.forEach((outcome) => {
          const result = getDecisionFromOutcome(outcome);
          expect(result).toBeDefined();
          expect(Object.values(ToolCallDecision)).toContain(result);
        });
      });

      it('should return consistent results for the same input', () => {
        const outcome = ToolConfirmationOutcome.ProceedOnce;
        const result1 = getDecisionFromOutcome(outcome);
        const result2 = getDecisionFromOutcome(outcome);
        expect(result1).toBe(result2);
      });
    });

    describe('decision distribution', () => {
      it('should have different decisions for different outcome categories', () => {
        const accept = getDecisionFromOutcome(
          ToolConfirmationOutcome.ProceedOnce,
        );
        const autoAccept = getDecisionFromOutcome(
          ToolConfirmationOutcome.ProceedAlways,
        );
        const modify = getDecisionFromOutcome(
          ToolConfirmationOutcome.ModifyWithEditor,
        );
        const reject = getDecisionFromOutcome(ToolConfirmationOutcome.Cancel);

        expect(accept).not.toBe(autoAccept);
        expect(accept).not.toBe(modify);
        expect(accept).not.toBe(reject);
        expect(autoAccept).not.toBe(modify);
        expect(autoAccept).not.toBe(reject);
        expect(modify).not.toBe(reject);
      });
    });
  });
});
