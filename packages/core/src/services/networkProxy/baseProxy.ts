/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { checkDomain } from './domainMatcher.js';
import type { DomainRule, DomainCheckResult } from './types.js';
import { DomainFilterAction } from './types.js';

export interface BaseProxyOptions {
  rules: DomainRule[];
  defaultAction: DomainFilterAction;
}

/**
 * Shared base class for HttpProxy and SocksProxy.
 *
 * Encapsulates domain filtering logic: rule evaluation, session-level
 * decision caching, and the PROMPT flow that emits 'domainCheck' events.
 */
export abstract class BaseProxy extends EventEmitter {
  protected rules: DomainRule[];
  protected defaultAction: DomainFilterAction;
  protected connectionCount = 0;
  protected deniedCount = 0;
  protected sessionDecisions = new Map<string, DomainFilterAction>();

  constructor(options: BaseProxyOptions) {
    super();
    this.rules = options.rules;
    this.defaultAction = options.defaultAction;
  }

  abstract start(): Promise<number>;
  abstract stop(): Promise<void>;
  abstract getPort(): number;

  getConnectionCount(): number {
    return this.connectionCount;
  }

  getDeniedCount(): number {
    return this.deniedCount;
  }

  updateRules(rules: DomainRule[]): void {
    this.rules = rules;
  }

  updateDefaultAction(action: DomainFilterAction): void {
    this.defaultAction = action;
  }

  recordSessionDecision(domain: string, action: DomainFilterAction): void {
    this.sessionDecisions.set(domain.toLowerCase(), action);
  }

  /**
   * Resolves the filtering action for a given hostname.
   * Checks session-level decisions first, then rules, then default.
   * If the resolved action is PROMPT, emits 'domainCheck' and waits
   * for a response.
   */
  protected async resolveAction(hostname: string): Promise<DomainFilterAction> {
    const sessionAction = this.sessionDecisions.get(hostname.toLowerCase());
    if (sessionAction !== undefined) {
      return sessionAction;
    }

    const result: DomainCheckResult = checkDomain(
      hostname,
      this.rules,
      this.defaultAction,
    );

    if (result.action !== DomainFilterAction.PROMPT) {
      return result.action;
    }

    return new Promise<DomainFilterAction>((resolve) => {
      const hasListeners = this.emit('domainCheck', hostname, (decision: DomainFilterAction) => {
        this.sessionDecisions.set(hostname.toLowerCase(), decision);
        resolve(decision);
      });

      if (!hasListeners) {
        resolve(DomainFilterAction.DENY);
      }
    });
  }
}
