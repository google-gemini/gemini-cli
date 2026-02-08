/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AvailableCredits,
  CreditType,
  GeminiUserTier,
} from '../code_assist/types.js';

/**
 * Strategy for handling quota exhaustion when AI credits are available.
 * - 'ask': Prompt the user each time
 * - 'always': Automatically use credits
 * - 'never': Never use credits, show standard fallback
 */
export type OverageStrategy = 'ask' | 'always' | 'never';

/** Credit type for Google One AI credits */
export const G1_CREDIT_TYPE: CreditType = 'GOOGLE_ONE_AI';

/** Base URL for Google One AI page */
const G1_AI_BASE_URL = 'https://one.google.com/ai';

/** AccountChooser URL for redirecting with email context */
const ACCOUNT_CHOOSER_URL = 'https://accounts.google.com/AccountChooser';

/** UTM parameters for CLI tracking */
const UTM_PARAMS = {
  utm_source: 'gemini_cli',
  utm_medium: 'product',
  utm_campaign: 'overage',
} as const;

/**
 * Wraps a URL in the AccountChooser redirect to maintain user context.
 * @param email User's email address for account selection
 * @param continueUrl The destination URL after account selection
 * @returns The full AccountChooser redirect URL
 */
export function wrapInAccountChooser(
  email: string,
  continueUrl: string,
): string {
  const params = new URLSearchParams({
    Email: email,
    continue: continueUrl,
  });
  return `${ACCOUNT_CHOOSER_URL}?${params.toString()}`;
}

/**
 * Builds a G1 AI URL with UTM tracking parameters.
 * @param path The path segment (e.g., 'activity' or 'credits')
 * @param email User's email for AccountChooser wrapper
 * @returns The complete URL wrapped in AccountChooser
 */
export function buildG1Url(
  path: 'activity' | 'credits',
  email: string,
): string {
  const baseUrl = `${G1_AI_BASE_URL}/${path}`;
  const params = new URLSearchParams(UTM_PARAMS);
  const urlWithUtm = `${baseUrl}?${params.toString()}`;
  return wrapInAccountChooser(email, urlWithUtm);
}

/**
 * Extracts the G1 AI credit balance from a tier's available credits.
 * @param tier The user tier to check
 * @returns The credit amount as a number, or 0 if not found
 */
export function getG1CreditBalance(
  tier: GeminiUserTier | null | undefined,
): number {
  if (!tier?.availableCredits) {
    return 0;
  }

  const g1Credits = tier.availableCredits.find(
    (credit: AvailableCredits) => credit.creditType === G1_CREDIT_TYPE,
  );

  if (!g1Credits?.creditAmount) {
    return 0;
  }

  // creditAmount is an int64 represented as string
  const balance = parseInt(g1Credits.creditAmount, 10);
  return isNaN(balance) ? 0 : balance;
}

/**
 * Determines if credits should be automatically used based on the overage strategy.
 * @param strategy The configured overage strategy
 * @param creditBalance The available credit balance
 * @returns true if credits should be auto-used, false otherwise
 */
export function shouldAutoUseCredits(
  strategy: OverageStrategy,
  creditBalance: number,
): boolean {
  return strategy === 'always' && creditBalance > 0;
}

/**
 * Determines if the overage menu should be shown based on the strategy.
 * @param strategy The configured overage strategy
 * @param creditBalance The available credit balance
 * @returns true if the menu should be shown
 */
export function shouldShowOverageMenu(
  strategy: OverageStrategy,
  creditBalance: number,
): boolean {
  // Show menu if strategy is 'ask' and there are credits available
  return strategy === 'ask' && creditBalance > 0;
}

/**
 * Determines if the empty wallet menu should be shown.
 * @param strategy The configured overage strategy
 * @param creditBalance The available credit balance
 * @returns true if the empty wallet menu should be shown
 */
export function shouldShowEmptyWalletMenu(
  strategy: OverageStrategy,
  creditBalance: number,
): boolean {
  // Show empty wallet menu if credits exist but balance is 0, and strategy isn't 'never'
  return strategy !== 'never' && creditBalance === 0;
}
