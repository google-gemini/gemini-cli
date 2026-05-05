/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { LogAttributes } from '@opentelemetry/api-logs';
import type { BaseTelemetryEvent } from './types.js';
import { getCommonAttributes } from './telemetryAttributes.js';
import type { OverageStrategy } from '../billing/billing.js';

/** Overage menu option that can be selected by the user */
export type OverageOption =
  | 'use_credits'
  | 'use_fallback'
  | 'manage'
  | 'stop'
  | 'get_credits';

// ============================================================================
// Event: Overage Menu Shown
// ============================================================================

export const EVENT_OVERAGE_MENU_SHOWN = 'gemini_cli.overage_menu_shown';

export class OverageMenuShownEvent implements BaseTelemetryEvent {
  'event.name': 'overage_menu_shown';
  'event.timestamp': string;
  model: string;
  credit_balance: number;
  overage_strategy: OverageStrategy;

  constructor(
    model: string,
    creditBalance: number,
    overageStrategy: OverageStrategy,
  ) {
    this['event.name'] = 'overage_menu_shown';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
    this.credit_balance = creditBalance;
    this.overage_strategy = overageStrategy;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_OVERAGE_MENU_SHOWN,
      'event.timestamp': this['event.timestamp'],
      model: this.model,
      credit_balance: this.credit_balance,
      overage_strategy: this.overage_strategy,
    };
  }

  toLogBody(): string {
    return `Overage menu shown for model ${this.model} with ${this.credit_balance} credits available.`;
  }
}

// ============================================================================
// Event: Overage Option Selected
// ============================================================================

export const EVENT_OVERAGE_OPTION_SELECTED =
  'gemini_cli.overage_option_selected';

export class OverageOptionSelectedEvent implements BaseTelemetryEvent {
  'event.name': 'overage_option_selected';
  'event.timestamp': string;
  model: string;
  selected_option: OverageOption;
  credit_balance: number;

  constructor(
    model: string,
    selectedOption: OverageOption,
    creditBalance: number,
  ) {
    this['event.name'] = 'overage_option_selected';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
    this.selected_option = selectedOption;
    this.credit_balance = creditBalance;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_OVERAGE_OPTION_SELECTED,
      'event.timestamp': this['event.timestamp'],
      model: this.model,
      selected_option: this.selected_option,
      credit_balance: this.credit_balance,
    };
  }

  toLogBody(): string {
    return `Overage option '${this.selected_option}' selected for model ${this.model}.`;
  }
}

// ============================================================================
// Event: Empty Wallet Menu Shown
// ============================================================================

export const EVENT_EMPTY_WALLET_MENU_SHOWN =
  'gemini_cli.empty_wallet_menu_shown';

export class EmptyWalletMenuShownEvent implements BaseTelemetryEvent {
  'event.name': 'empty_wallet_menu_shown';
  'event.timestamp': string;
  model: string;

  constructor(model: string) {
    this['event.name'] = 'empty_wallet_menu_shown';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_EMPTY_WALLET_MENU_SHOWN,
      'event.timestamp': this['event.timestamp'],
      model: this.model,
    };
  }

  toLogBody(): string {
    return `Empty wallet menu shown for model ${this.model}.`;
  }
}

// ============================================================================
// Event: Credit Purchase Click
// ============================================================================

export const EVENT_CREDIT_PURCHASE_CLICK = 'gemini_cli.credit_purchase_click';

export class CreditPurchaseClickEvent implements BaseTelemetryEvent {
  'event.name': 'credit_purchase_click';
  'event.timestamp': string;
  source: 'overage_menu' | 'empty_wallet_menu' | 'manage';
  model: string;

  constructor(
    source: 'overage_menu' | 'empty_wallet_menu' | 'manage',
    model: string,
  ) {
    this['event.name'] = 'credit_purchase_click';
    this['event.timestamp'] = new Date().toISOString();
    this.source = source;
    this.model = model;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_CREDIT_PURCHASE_CLICK,
      'event.timestamp': this['event.timestamp'],
      source: this.source,
      model: this.model,
    };
  }

  toLogBody(): string {
    return `Credit purchase clicked from ${this.source} for model ${this.model}.`;
  }
}

// ============================================================================
// Event: Credits Used
// ============================================================================

export const EVENT_CREDITS_USED = 'gemini_cli.credits_used';

export class CreditsUsedEvent implements BaseTelemetryEvent {
  'event.name': 'credits_used';
  'event.timestamp': string;
  model: string;
  credits_consumed: number;
  credits_remaining: number;

  constructor(
    model: string,
    creditsConsumed: number,
    creditsRemaining: number,
  ) {
    this['event.name'] = 'credits_used';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
    this.credits_consumed = creditsConsumed;
    this.credits_remaining = creditsRemaining;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_CREDITS_USED,
      'event.timestamp': this['event.timestamp'],
      model: this.model,
      credits_consumed: this.credits_consumed,
      credits_remaining: this.credits_remaining,
    };
  }

  toLogBody(): string {
    return `${this.credits_consumed} credits consumed for model ${this.model}. ${this.credits_remaining} remaining.`;
  }
}

// ============================================================================
// Event: API Key Updated (Auth Type Changed)
// ============================================================================

export const EVENT_API_KEY_UPDATED = 'gemini_cli.api_key_updated';

export class ApiKeyUpdatedEvent implements BaseTelemetryEvent {
  'event.name': 'api_key_updated';
  'event.timestamp': string;
  previous_auth_type: string;
  new_auth_type: string;

  constructor(previousAuthType: string, newAuthType: string) {
    this['event.name'] = 'api_key_updated';
    this['event.timestamp'] = new Date().toISOString();
    this.previous_auth_type = previousAuthType;
    this.new_auth_type = newAuthType;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_API_KEY_UPDATED,
      'event.timestamp': this['event.timestamp'],
      previous_auth_type: this.previous_auth_type,
      new_auth_type: this.new_auth_type,
    };
  }

  toLogBody(): string {
    return `Auth type changed from ${this.previous_auth_type} to ${this.new_auth_type}.`;
  }
}

/** Union type of all billing-related telemetry events */
export type BillingTelemetryEvent =
  | OverageMenuShownEvent
  | OverageOptionSelectedEvent
  | EmptyWalletMenuShownEvent
  | CreditPurchaseClickEvent
  | CreditsUsedEvent
  | ApiKeyUpdatedEvent;
