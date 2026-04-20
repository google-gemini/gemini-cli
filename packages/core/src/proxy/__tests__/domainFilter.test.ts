/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DomainFilter } from '../domainFilter.js';
import { DomainAction, DefaultPolicy } from '../types.js';

describe('DomainFilter', () => {
  let filter: DomainFilter;

  beforeEach(() => {
    filter = new DomainFilter(DefaultPolicy.ALLOW_ALL);
  });

  describe('default policy', () => {
    it('should allow all by default', () => {
      expect(filter.isAllowed('example.com')).toBe(true);
    });

    it('should deny all when default is deny-all', () => {
      filter = new DomainFilter(DefaultPolicy.DENY_ALL);
      expect(filter.isAllowed('example.com')).toBe(false);
    });
  });

  describe('exact match rules', () => {
    it('should allow exact domain match', () => {
      filter = new DomainFilter(DefaultPolicy.DENY_ALL);
      filter.addRule({ pattern: 'api.google.com', action: DomainAction.ALLOW });
      expect(filter.isAllowed('api.google.com')).toBe(true);
      expect(filter.isAllowed('other.google.com')).toBe(false);
    });

    it('should deny exact domain match', () => {
      filter.addRule({ pattern: 'evil.com', action: DomainAction.DENY });
      expect(filter.isAllowed('evil.com')).toBe(false);
      expect(filter.isAllowed('good.com')).toBe(true);
    });

    it('should be case-insensitive', () => {
      filter.addRule({ pattern: 'API.Google.COM', action: DomainAction.DENY });
      expect(filter.isAllowed('api.google.com')).toBe(false);
    });
  });

  describe('wildcard matching', () => {
    it('should match *.example.com', () => {
      filter = new DomainFilter(DefaultPolicy.DENY_ALL);
      filter.addRule({ pattern: '*.google.com', action: DomainAction.ALLOW });
      expect(filter.isAllowed('api.google.com')).toBe(true);
      expect(filter.isAllowed('deep.sub.google.com')).toBe(true);
      expect(filter.isAllowed('google.com')).toBe(false);
    });

    it('should match * wildcard for all domains', () => {
      filter = new DomainFilter(DefaultPolicy.DENY_ALL);
      filter.addRule({ pattern: '*', action: DomainAction.ALLOW });
      expect(filter.isAllowed('anything.com')).toBe(true);
    });
  });

  describe('port-specific rules', () => {
    it('should match port in pattern', () => {
      filter = new DomainFilter(DefaultPolicy.DENY_ALL);
      filter.addRule({ pattern: 'localhost:3000', action: DomainAction.ALLOW });
      expect(filter.isAllowed('localhost', 3000)).toBe(true);
      expect(filter.isAllowed('localhost', 8080)).toBe(false);
    });

    it('should match port in rule', () => {
      filter = new DomainFilter(DefaultPolicy.DENY_ALL);
      filter.addRule({
        pattern: 'localhost',
        action: DomainAction.ALLOW,
        port: 3000,
      });
      expect(filter.isAllowed('localhost', 3000)).toBe(true);
      expect(filter.isAllowed('localhost', 8080)).toBe(false);
    });
  });

  describe('protocol-specific rules', () => {
    it('should match protocol constraint', () => {
      filter = new DomainFilter(DefaultPolicy.DENY_ALL);
      filter.addRule({
        pattern: 'example.com',
        action: DomainAction.ALLOW,
        protocol: 'https',
      });
      expect(filter.isAllowed('example.com', undefined, 'https')).toBe(true);
      expect(filter.isAllowed('example.com', undefined, 'http')).toBe(false);
    });
  });

  describe('deny takes precedence', () => {
    it('should deny even if allow rule also matches', () => {
      filter.addRule({ pattern: '*.google.com', action: DomainAction.ALLOW });
      filter.addRule({ pattern: 'evil.google.com', action: DomainAction.DENY });
      expect(filter.isAllowed('evil.google.com')).toBe(false);
      expect(filter.isAllowed('good.google.com')).toBe(true);
    });
  });

  describe('rule management', () => {
    it('should remove rules', () => {
      filter.addRule({ pattern: 'evil.com', action: DomainAction.DENY });
      expect(filter.isAllowed('evil.com')).toBe(false);
      filter.removeRule('evil.com');
      expect(filter.isAllowed('evil.com')).toBe(true);
    });

    it('should clear all rules', () => {
      filter.addRule({ pattern: 'evil.com', action: DomainAction.DENY });
      filter.clearRules();
      expect(filter.isAllowed('evil.com')).toBe(true);
    });

    it('should add multiple rules at once', () => {
      filter.addRules([
        { pattern: 'evil.com', action: DomainAction.DENY },
        { pattern: 'bad.com', action: DomainAction.DENY },
      ]);
      expect(filter.isAllowed('evil.com')).toBe(false);
      expect(filter.isAllowed('bad.com')).toBe(false);
    });
  });

  describe('getMatchingRule', () => {
    it('should return matching deny rule', () => {
      const rule = { pattern: 'evil.com', action: DomainAction.DENY };
      filter.addRule(rule);
      expect(filter.getMatchingRule('evil.com')).toEqual(rule);
    });

    it('should return undefined when no rule matches', () => {
      expect(filter.getMatchingRule('unknown.com')).toBeUndefined();
    });
  });
});
