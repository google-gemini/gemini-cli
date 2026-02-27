/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeFakeConfig } from '../test-utils/config.js';
import {
  OverageMenuShownEvent,
  OverageOptionSelectedEvent,
  EmptyWalletMenuShownEvent,
  CreditPurchaseClickEvent,
  CreditsUsedEvent,
  ApiKeyUpdatedEvent,
  EVENT_OVERAGE_MENU_SHOWN,
  EVENT_OVERAGE_OPTION_SELECTED,
  EVENT_EMPTY_WALLET_MENU_SHOWN,
  EVENT_CREDIT_PURCHASE_CLICK,
  EVENT_CREDITS_USED,
  EVENT_API_KEY_UPDATED,
} from './billingEvents.js';

describe('billingEvents', () => {
  const fakeConfig = makeFakeConfig();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('OverageMenuShownEvent', () => {
    it('should construct with correct properties', () => {
      const event = new OverageMenuShownEvent(
        'gemini-3-pro-preview',
        500,
        'ask',
      );
      expect(event['event.name']).toBe('overage_menu_shown');
      expect(event.model).toBe('gemini-3-pro-preview');
      expect(event.credit_balance).toBe(500);
      expect(event.overage_strategy).toBe('ask');
    });

    it('should produce correct OpenTelemetry attributes', () => {
      const event = new OverageMenuShownEvent(
        'gemini-3-pro-preview',
        500,
        'ask',
      );
      const attrs = event.toOpenTelemetryAttributes(fakeConfig);
      expect(attrs['event.name']).toBe(EVENT_OVERAGE_MENU_SHOWN);
      expect(attrs['model']).toBe('gemini-3-pro-preview');
      expect(attrs['credit_balance']).toBe(500);
      expect(attrs['overage_strategy']).toBe('ask');
    });

    it('should produce a human-readable log body', () => {
      const event = new OverageMenuShownEvent(
        'gemini-3-pro-preview',
        500,
        'ask',
      );
      expect(event.toLogBody()).toContain('gemini-3-pro-preview');
      expect(event.toLogBody()).toContain('500');
    });
  });

  describe('OverageOptionSelectedEvent', () => {
    it('should construct with correct properties', () => {
      const event = new OverageOptionSelectedEvent(
        'gemini-3-pro-preview',
        'use_credits',
        100,
      );
      expect(event['event.name']).toBe('overage_option_selected');
      expect(event.selected_option).toBe('use_credits');
      expect(event.credit_balance).toBe(100);
    });

    it('should produce correct OpenTelemetry attributes', () => {
      const event = new OverageOptionSelectedEvent(
        'gemini-3-pro-preview',
        'use_fallback',
        200,
      );
      const attrs = event.toOpenTelemetryAttributes(fakeConfig);
      expect(attrs['event.name']).toBe(EVENT_OVERAGE_OPTION_SELECTED);
      expect(attrs['selected_option']).toBe('use_fallback');
    });

    it('should produce a human-readable log body', () => {
      const event = new OverageOptionSelectedEvent(
        'gemini-3-pro-preview',
        'manage',
        100,
      );
      expect(event.toLogBody()).toContain('manage');
      expect(event.toLogBody()).toContain('gemini-3-pro-preview');
    });
  });

  describe('EmptyWalletMenuShownEvent', () => {
    it('should construct with correct properties', () => {
      const event = new EmptyWalletMenuShownEvent('gemini-3-pro-preview');
      expect(event['event.name']).toBe('empty_wallet_menu_shown');
      expect(event.model).toBe('gemini-3-pro-preview');
    });

    it('should produce correct OpenTelemetry attributes', () => {
      const event = new EmptyWalletMenuShownEvent('gemini-3-pro-preview');
      const attrs = event.toOpenTelemetryAttributes(fakeConfig);
      expect(attrs['event.name']).toBe(EVENT_EMPTY_WALLET_MENU_SHOWN);
      expect(attrs['model']).toBe('gemini-3-pro-preview');
    });

    it('should produce a human-readable log body', () => {
      const event = new EmptyWalletMenuShownEvent('gemini-3-pro-preview');
      expect(event.toLogBody()).toContain('gemini-3-pro-preview');
    });
  });

  describe('CreditPurchaseClickEvent', () => {
    it('should construct with correct properties', () => {
      const event = new CreditPurchaseClickEvent(
        'empty_wallet_menu',
        'gemini-3-pro-preview',
      );
      expect(event['event.name']).toBe('credit_purchase_click');
      expect(event.source).toBe('empty_wallet_menu');
      expect(event.model).toBe('gemini-3-pro-preview');
    });

    it('should produce correct OpenTelemetry attributes', () => {
      const event = new CreditPurchaseClickEvent(
        'overage_menu',
        'gemini-3-pro-preview',
      );
      const attrs = event.toOpenTelemetryAttributes(fakeConfig);
      expect(attrs['event.name']).toBe(EVENT_CREDIT_PURCHASE_CLICK);
      expect(attrs['source']).toBe('overage_menu');
    });

    it('should produce a human-readable log body', () => {
      const event = new CreditPurchaseClickEvent(
        'manage',
        'gemini-3-pro-preview',
      );
      expect(event.toLogBody()).toContain('manage');
      expect(event.toLogBody()).toContain('gemini-3-pro-preview');
    });
  });

  describe('CreditsUsedEvent', () => {
    it('should construct with correct properties', () => {
      const event = new CreditsUsedEvent('gemini-3-pro-preview', 10, 490);
      expect(event['event.name']).toBe('credits_used');
      expect(event.credits_consumed).toBe(10);
      expect(event.credits_remaining).toBe(490);
    });

    it('should produce correct OpenTelemetry attributes', () => {
      const event = new CreditsUsedEvent('gemini-3-pro-preview', 10, 490);
      const attrs = event.toOpenTelemetryAttributes(fakeConfig);
      expect(attrs['event.name']).toBe(EVENT_CREDITS_USED);
      expect(attrs['credits_consumed']).toBe(10);
      expect(attrs['credits_remaining']).toBe(490);
    });

    it('should produce a human-readable log body', () => {
      const event = new CreditsUsedEvent('gemini-3-pro-preview', 10, 490);
      const body = event.toLogBody();
      expect(body).toContain('10');
      expect(body).toContain('490');
      expect(body).toContain('gemini-3-pro-preview');
    });
  });

  describe('ApiKeyUpdatedEvent', () => {
    it('should construct with correct properties', () => {
      const event = new ApiKeyUpdatedEvent('google_login', 'api_key');
      expect(event['event.name']).toBe('api_key_updated');
      expect(event.previous_auth_type).toBe('google_login');
      expect(event.new_auth_type).toBe('api_key');
    });

    it('should produce correct OpenTelemetry attributes', () => {
      const event = new ApiKeyUpdatedEvent('google_login', 'api_key');
      const attrs = event.toOpenTelemetryAttributes(fakeConfig);
      expect(attrs['event.name']).toBe(EVENT_API_KEY_UPDATED);
      expect(attrs['previous_auth_type']).toBe('google_login');
      expect(attrs['new_auth_type']).toBe('api_key');
    });

    it('should produce a human-readable log body', () => {
      const event = new ApiKeyUpdatedEvent('google_login', 'api_key');
      const body = event.toLogBody();
      expect(body).toContain('google_login');
      expect(body).toContain('api_key');
    });
  });
});
