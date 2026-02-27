/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { GeminiUserTier } from '../code_assist/types.js';
import {
  buildG1Url,
  getG1CreditBalance,
  G1_CREDIT_TYPE,
  G1_UTM_CAMPAIGNS,
  isOverageEligibleModel,
  shouldAutoUseCredits,
  shouldShowEmptyWalletMenu,
  shouldShowOverageMenu,
  wrapInAccountChooser,
} from './billing.js';

describe('billing', () => {
  describe('wrapInAccountChooser', () => {
    it('should wrap URL with AccountChooser redirect', () => {
      const result = wrapInAccountChooser(
        'user@gmail.com',
        'https://one.google.com/ai/activity',
      );
      expect(result).toBe(
        'https://accounts.google.com/AccountChooser?Email=user%40gmail.com&continue=https%3A%2F%2Fone.google.com%2Fai%2Factivity',
      );
    });

    it('should handle special characters in email', () => {
      const result = wrapInAccountChooser(
        'user+test@example.com',
        'https://example.com',
      );
      expect(result).toContain('Email=user%2Btest%40example.com');
    });
  });

  describe('buildG1Url', () => {
    it('should build activity URL with UTM params wrapped in AccountChooser', () => {
      const result = buildG1Url(
        'activity',
        'user@gmail.com',
        G1_UTM_CAMPAIGNS.MANAGE_ACTIVITY,
      );

      // Should contain AccountChooser prefix
      expect(result).toContain('https://accounts.google.com/AccountChooser');
      expect(result).toContain('Email=user%40gmail.com');

      // The continue URL should contain the G1 activity path and UTM params
      expect(result).toContain('one.google.com%2Fai%2Factivity');
      expect(result).toContain('utm_source%3Dgemini_cli');
      expect(result).toContain(
        'utm_campaign%3Dhydrogen_cli_settings_ai_credits_activity_page',
      );
    });

    it('should build credits URL with UTM params wrapped in AccountChooser', () => {
      const result = buildG1Url(
        'credits',
        'test@example.com',
        G1_UTM_CAMPAIGNS.EMPTY_WALLET_ADD_CREDITS,
      );

      expect(result).toContain('https://accounts.google.com/AccountChooser');
      expect(result).toContain('one.google.com%2Fai%2Fcredits');
      expect(result).toContain(
        'utm_campaign%3Dhydrogen_cli_insufficient_credits_add_credits',
      );
    });
  });

  describe('getG1CreditBalance', () => {
    it('should return null for null tier', () => {
      expect(getG1CreditBalance(null)).toBeNull();
    });

    it('should return null for undefined tier', () => {
      expect(getG1CreditBalance(undefined)).toBeNull();
    });

    it('should return null for tier without availableCredits', () => {
      const tier: GeminiUserTier = { id: 'PERSONAL' };
      expect(getG1CreditBalance(tier)).toBeNull();
    });

    it('should return null for empty availableCredits array', () => {
      const tier: GeminiUserTier = { id: 'PERSONAL', availableCredits: [] };
      expect(getG1CreditBalance(tier)).toBeNull();
    });

    it('should return null when no G1 credit type found', () => {
      const tier: GeminiUserTier = {
        id: 'PERSONAL',
        availableCredits: [
          { creditType: 'CREDIT_TYPE_UNSPECIFIED', creditAmount: '100' },
        ],
      };
      expect(getG1CreditBalance(tier)).toBeNull();
    });

    it('should return G1 credit balance when present', () => {
      const tier: GeminiUserTier = {
        id: 'PERSONAL',
        availableCredits: [{ creditType: G1_CREDIT_TYPE, creditAmount: '500' }],
      };
      expect(getG1CreditBalance(tier)).toBe(500);
    });

    it('should return G1 credit balance when multiple credit types present', () => {
      const tier: GeminiUserTier = {
        id: 'PERSONAL',
        availableCredits: [
          { creditType: 'CREDIT_TYPE_UNSPECIFIED', creditAmount: '100' },
          { creditType: G1_CREDIT_TYPE, creditAmount: '750' },
        ],
      };
      expect(getG1CreditBalance(tier)).toBe(750);
    });

    it('should return 0 for invalid credit amount', () => {
      const tier: GeminiUserTier = {
        id: 'PERSONAL',
        availableCredits: [
          { creditType: G1_CREDIT_TYPE, creditAmount: 'invalid' },
        ],
      };
      expect(getG1CreditBalance(tier)).toBe(0);
    });

    it('should handle large credit amounts (int64 as string)', () => {
      const tier: GeminiUserTier = {
        id: 'PERSONAL',
        availableCredits: [
          { creditType: G1_CREDIT_TYPE, creditAmount: '9999999999' },
        ],
      };
      expect(getG1CreditBalance(tier)).toBe(9999999999);
    });

    it('should sum multiple credits of the same G1 type', () => {
      const tier: GeminiUserTier = {
        id: 'PERSONAL',
        availableCredits: [
          { creditType: G1_CREDIT_TYPE, creditAmount: '1000' },
          { creditType: G1_CREDIT_TYPE, creditAmount: '8' },
        ],
      };
      expect(getG1CreditBalance(tier)).toBe(1008);
    });
  });

  describe('shouldAutoUseCredits', () => {
    it('should return true when strategy is always and balance > 0', () => {
      expect(shouldAutoUseCredits('always', 100)).toBe(true);
    });

    it('should return false when strategy is always but balance is 0', () => {
      expect(shouldAutoUseCredits('always', 0)).toBe(false);
    });

    it('should return false when strategy is ask', () => {
      expect(shouldAutoUseCredits('ask', 100)).toBe(false);
    });

    it('should return false when strategy is never', () => {
      expect(shouldAutoUseCredits('never', 100)).toBe(false);
    });

    it('should return false when creditBalance is null (ineligible)', () => {
      expect(shouldAutoUseCredits('always', null)).toBe(false);
    });
  });

  describe('shouldShowOverageMenu', () => {
    it('should return true when strategy is ask and balance > 0', () => {
      expect(shouldShowOverageMenu('ask', 100)).toBe(true);
    });

    it('should return false when strategy is ask but balance is 0', () => {
      expect(shouldShowOverageMenu('ask', 0)).toBe(false);
    });

    it('should return false when strategy is always', () => {
      expect(shouldShowOverageMenu('always', 100)).toBe(false);
    });

    it('should return false when strategy is never', () => {
      expect(shouldShowOverageMenu('never', 100)).toBe(false);
    });

    it('should return false when creditBalance is null (ineligible)', () => {
      expect(shouldShowOverageMenu('ask', null)).toBe(false);
    });
  });

  describe('shouldShowEmptyWalletMenu', () => {
    it('should return true when strategy is ask and balance is 0', () => {
      expect(shouldShowEmptyWalletMenu('ask', 0)).toBe(true);
    });

    it('should return true when strategy is always and balance is 0', () => {
      expect(shouldShowEmptyWalletMenu('always', 0)).toBe(true);
    });

    it('should return false when strategy is never', () => {
      expect(shouldShowEmptyWalletMenu('never', 0)).toBe(false);
    });

    it('should return false when balance > 0', () => {
      expect(shouldShowEmptyWalletMenu('ask', 100)).toBe(false);
    });

    it('should return false when creditBalance is null (ineligible)', () => {
      expect(shouldShowEmptyWalletMenu('ask', null)).toBe(false);
    });
  });

  describe('isOverageEligibleModel', () => {
    it('should return true for gemini-3-pro-preview', () => {
      expect(isOverageEligibleModel('gemini-3-pro-preview')).toBe(true);
    });

    it('should return true for gemini-3.1-pro-preview', () => {
      expect(isOverageEligibleModel('gemini-3.1-pro-preview')).toBe(true);
    });

    it('should return true for gemini-3.1-pro-preview-customtools', () => {
      expect(isOverageEligibleModel('gemini-3.1-pro-preview-customtools')).toBe(
        false,
      );
    });

    it('should return false for gemini-3-flash-preview', () => {
      expect(isOverageEligibleModel('gemini-3-flash-preview')).toBe(false);
    });

    it('should return false for gemini-2.5-pro', () => {
      expect(isOverageEligibleModel('gemini-2.5-pro')).toBe(false);
    });

    it('should return false for gemini-2.5-flash', () => {
      expect(isOverageEligibleModel('gemini-2.5-flash')).toBe(false);
    });

    it('should return false for custom model names', () => {
      expect(isOverageEligibleModel('my-custom-model')).toBe(false);
    });
  });
});
