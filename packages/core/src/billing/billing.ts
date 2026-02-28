/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AvailableCredits,
  CreditType,
  GeminiUserTier,
} from '../code_assist/types.js';
import {
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
} from '../config/models.js';

/**
 * Strategy for handling quota exhaustion when AI credits are available.
 * - 'ask': Prompt the user each time
 * - 'always': Automatically use credits
 * - 'never': Never use credits, show standard fallback
 */
export type OverageStrategy = 'ask' | 'always' | 'never';

/** Credit type for Google One AI credits */
export const G1_CREDIT_TYPE: CreditType = 'GOOGLE_ONE_AI';

/**
 * The set of models that support AI credits overage billing.
 * Only these models are eligible for the credits-based retry flow.
 */
export const OVERAGE_ELIGIBLE_MODELS = new Set([
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
]);

/**
 * Checks if a model is eligible for AI credits overage billing.
 * @param model The model name to check.
 * @returns true if the model supports credits overage, false otherwise.
 */
export function isOverageEligibleModel(model: string): boolean {
  return OVERAGE_ELIGIBLE_MODELS.has(model);
}

/** Base URL for Google One AI page */
const G1_AI_BASE_URL = 'https://one.google.com/ai';

/** AccountChooser URL for redirecting with email context */
const ACCOUNT_CHOOSER_URL = 'https://accounts.google.com/AccountChooser';

/** UTM parameters for CLI tracking */
const UTM_SOURCE = 'gemini_cli';
// TODO: change to 'desktop' when G1 service fix is rolled out
const UTM_MEDIUM = 'web';

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
 * UTM campaign identifiers per the design doc.
 */
export const G1_UTM_CAMPAIGNS = {
  /** From Interception Flow "Manage" link (user has credits) */
  MANAGE_ACTIVITY: 'hydrogen_cli_settings_ai_credits_activity_page',
  /** From "Manage" to add more credits */
  MANAGE_ADD_CREDITS: 'hydrogen_cli_settings_add_credits',
  /** From Empty Wallet Flow "Get AI Credits" link */
  EMPTY_WALLET_ADD_CREDITS: 'hydrogen_cli_insufficient_credits_add_credits',
} as const;

/**
 * Builds a G1 AI URL with UTM tracking parameters.
 * @param path The path segment (e.g., 'activity' or 'credits')
 * @param email User's email for AccountChooser wrapper
 * @param campaign The UTM campaign identifier
 * @returns The complete URL wrapped in AccountChooser
 */
export function buildG1Url(
  path: 'activity' | 'credits',
  email: string,
  campaign: string,
): string {
  const baseUrl = `${G1_AI_BASE_URL}/${path}`;
  const params = new URLSearchParams({
    utm_source: UTM_SOURCE,
    utm_medium: UTM_MEDIUM,
    utm_campaign: campaign,
  });
  const urlWithUtm = `${baseUrl}?${params.toString()}`;
  return wrapInAccountChooser(email, urlWithUtm);
}

/**
 * Extracts the G1 AI credit balance from a tier's available credits.
 * @param tier The user tier to check
 * @returns The credit amount as a number, 0 if eligible but empty, or null if not eligible
 */
export function getG1CreditBalance(
  tier: GeminiUserTier | null | undefined,
): number | null {
  if (!tier?.availableCredits) {
    return null;
  }

  const g1Credits = tier.availableCredits.filter(
    (credit: AvailableCredits) => credit.creditType === G1_CREDIT_TYPE,
  );

  if (g1Credits.length === 0) {
    return null;
  }

  // creditAmount is an int64 represented as string; sum all matching entries
  return g1Credits.reduce((sum, credit) => {
    const amount = parseInt(credit.creditAmount ?? '0', 10);
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);
}

export const MIN_CREDIT_BALANCE = 50;

/**
 * Determines if credits should be automatically used based on the overage strategy.
 * @param strategy The configured overage strategy
 * @param creditBalance The available credit balance
 * @returns true if credits should be auto-used, false otherwise
 */
export function shouldAutoUseCredits(
  strategy: OverageStrategy,
  creditBalance: number | null,
): boolean {
  return (
    strategy === 'always' &&
    creditBalance != null &&
    creditBalance >= MIN_CREDIT_BALANCE
  );
}

/**
 * Determines if the overage menu should be shown based on the strategy.
 * @param strategy The configured overage strategy
 * @param creditBalance The available credit balance
 * @returns true if the menu should be shown
 */
export function shouldShowOverageMenu(
  strategy: OverageStrategy,
  creditBalance: number | null,
): boolean {
  return (
    strategy === 'ask' &&
    creditBalance != null &&
    creditBalance >= MIN_CREDIT_BALANCE
  );
}

/**
 * Determines if the empty wallet menu should be shown.
 * @param strategy The configured overage strategy
 * @param creditBalance The available credit balance
 * @returns true if the empty wallet menu should be shown
 */
export function shouldShowEmptyWalletMenu(
  strategy: OverageStrategy,
  creditBalance: number | null,
): boolean {
  return (
    strategy !== 'never' &&
    creditBalance != null &&
    creditBalance < MIN_CREDIT_BALANCE
  );
}
