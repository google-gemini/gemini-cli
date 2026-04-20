/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Domain filtering with wildcard pattern matching.
 */

import { DomainAction, DefaultPolicy } from './types.js';
import type { DomainRule } from './types.js';

export class DomainFilter {
  private readonly rules: DomainRule[] = [];
  private defaultPolicy: DefaultPolicy;

  constructor(defaultPolicy: DefaultPolicy = DefaultPolicy.ALLOW_ALL) {
    this.defaultPolicy = defaultPolicy;
  }

  addRule(rule: DomainRule): void {
    this.rules.push(rule);
  }

  addRules(rules: DomainRule[]): void {
    for (const rule of rules) {
      this.addRule(rule);
    }
  }

  removeRule(pattern: string): boolean {
    const index = this.rules.findIndex((r) => r.pattern === pattern);
    if (index !== -1) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  clearRules(): void {
    this.rules.length = 0;
  }

  setDefaultPolicy(policy: DefaultPolicy): void {
    this.defaultPolicy = policy;
  }

  isAllowed(domain: string, port?: number, protocol?: string): boolean {
    // Check deny rules first (deny takes precedence)
    for (const rule of this.rules) {
      if (
        rule.action === DomainAction.DENY &&
        this.matchesRule(rule, domain, port, protocol)
      ) {
        return false;
      }
    }

    // Check allow rules
    for (const rule of this.rules) {
      if (
        rule.action === DomainAction.ALLOW &&
        this.matchesRule(rule, domain, port, protocol)
      ) {
        return true;
      }
    }

    // Fall back to default policy
    return this.defaultPolicy === DefaultPolicy.ALLOW_ALL;
  }

  getMatchingRule(
    domain: string,
    port?: number,
    protocol?: string,
  ): DomainRule | undefined {
    // Check deny rules first
    for (const rule of this.rules) {
      if (
        rule.action === DomainAction.DENY &&
        this.matchesRule(rule, domain, port, protocol)
      ) {
        return rule;
      }
    }
    for (const rule of this.rules) {
      if (
        rule.action === DomainAction.ALLOW &&
        this.matchesRule(rule, domain, port, protocol)
      ) {
        return rule;
      }
    }
    return undefined;
  }

  private matchesRule(
    rule: DomainRule,
    domain: string,
    port?: number,
    protocol?: string,
  ): boolean {
    // Check port constraint
    if (rule.port !== undefined && port !== undefined && rule.port !== port) {
      return false;
    }

    // Check protocol constraint
    if (
      rule.protocol !== undefined &&
      protocol !== undefined &&
      rule.protocol !== protocol
    ) {
      return false;
    }

    return this.matchPattern(rule.pattern, domain, port);
  }

  private matchPattern(
    pattern: string,
    domain: string,
    port?: number,
  ): boolean {
    // Handle port in pattern: "localhost:3000"
    const colonIndex = pattern.lastIndexOf(':');
    if (colonIndex !== -1 && !pattern.startsWith('[')) {
      const patternHost = pattern.slice(0, colonIndex);
      const patternPort = parseInt(pattern.slice(colonIndex + 1), 10);
      if (!isNaN(patternPort)) {
        if (port !== undefined && patternPort !== port) {
          return false;
        }
        return this.matchWildcard(patternHost, domain);
      }
    }

    return this.matchWildcard(pattern, domain);
  }

  private matchWildcard(pattern: string, value: string): boolean {
    const lowerPattern = pattern.toLowerCase();
    const lowerValue = value.toLowerCase();

    // Exact match
    if (lowerPattern === lowerValue) {
      return true;
    }

    // Wildcard: *.example.com matches sub.example.com and deep.sub.example.com
    if (lowerPattern.startsWith('*.')) {
      const suffix = lowerPattern.slice(1); // .example.com
      return lowerValue.endsWith(suffix) && lowerValue.length > suffix.length;
    }

    // Full wildcard
    if (lowerPattern === '*') {
      return true;
    }

    return false;
  }
}
