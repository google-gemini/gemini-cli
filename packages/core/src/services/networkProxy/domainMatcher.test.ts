/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  matchesDomainPattern,
  checkDomain,
  checkDomainWithConfig,
  extractHostname,
  extractPort,
} from './domainMatcher.js';
import { DomainFilterAction, DEFAULT_NETWORK_PROXY_CONFIG } from './types.js';
import type { DomainRule } from './types.js';

describe('matchesDomainPattern', () => {
  it('matches exact domain', () => {
    expect(matchesDomainPattern('example.com', 'example.com')).toBe(true);
  });

  it('rejects non-matching exact domain', () => {
    expect(matchesDomainPattern('example.com', 'other.com')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesDomainPattern('Example.COM', 'example.com')).toBe(true);
    expect(matchesDomainPattern('example.com', 'EXAMPLE.COM')).toBe(true);
  });

  it('matches wildcard subdomain', () => {
    expect(matchesDomainPattern('*.example.com', 'sub.example.com')).toBe(true);
    expect(matchesDomainPattern('*.example.com', 'a.b.example.com')).toBe(true);
  });

  it('wildcard matches the base domain itself', () => {
    expect(matchesDomainPattern('*.example.com', 'example.com')).toBe(true);
  });

  it('wildcard does not match unrelated domains', () => {
    expect(matchesDomainPattern('*.example.com', 'notexample.com')).toBe(false);
    expect(matchesDomainPattern('*.example.com', 'other.com')).toBe(false);
  });

  it('full wildcard matches everything', () => {
    expect(matchesDomainPattern('*', 'anything.com')).toBe(true);
    expect(matchesDomainPattern('*', 'sub.domain.example.org')).toBe(true);
  });

  it('trims whitespace', () => {
    expect(matchesDomainPattern('  example.com  ', 'example.com')).toBe(true);
  });

  it('normalizes trailing dots in hostnames', () => {
    expect(matchesDomainPattern('example.com', 'example.com.')).toBe(true);
    expect(matchesDomainPattern('example.com.', 'example.com')).toBe(true);
  });

  it('normalizes trailing dots with wildcard patterns', () => {
    expect(matchesDomainPattern('*.example.com', 'sub.example.com.')).toBe(true);
  });
});

describe('checkDomain', () => {
  const rules: DomainRule[] = [
    { pattern: '*.googleapis.com', action: DomainFilterAction.ALLOW },
    { pattern: 'evil.com', action: DomainFilterAction.DENY },
    { pattern: '*.internal.corp', action: DomainFilterAction.DENY },
  ];

  it('returns ALLOW for matching allowlisted domain', () => {
    const result = checkDomain('storage.googleapis.com', rules, DomainFilterAction.PROMPT);
    expect(result.action).toBe(DomainFilterAction.ALLOW);
    expect(result.matchedRule?.pattern).toBe('*.googleapis.com');
  });

  it('returns DENY for matching denylisted domain', () => {
    const result = checkDomain('evil.com', rules, DomainFilterAction.PROMPT);
    expect(result.action).toBe(DomainFilterAction.DENY);
  });

  it('returns default action for unmatched domain', () => {
    const result = checkDomain('unknown.com', rules, DomainFilterAction.PROMPT);
    expect(result.action).toBe(DomainFilterAction.PROMPT);
    expect(result.matchedRule).toBeUndefined();
  });

  it('first matching rule wins', () => {
    const overlappingRules: DomainRule[] = [
      { pattern: '*.example.com', action: DomainFilterAction.ALLOW },
      { pattern: 'bad.example.com', action: DomainFilterAction.DENY },
    ];
    const result = checkDomain('bad.example.com', overlappingRules, DomainFilterAction.PROMPT);
    expect(result.action).toBe(DomainFilterAction.ALLOW);
  });

  it('handles empty rules list', () => {
    const result = checkDomain('example.com', [], DomainFilterAction.DENY);
    expect(result.action).toBe(DomainFilterAction.DENY);
  });
});

describe('checkDomainWithConfig', () => {
  it('delegates to checkDomain with config values', () => {
    const config = {
      ...DEFAULT_NETWORK_PROXY_CONFIG,
      rules: [
        { pattern: '*.google.com', action: DomainFilterAction.ALLOW },
      ],
      defaultAction: DomainFilterAction.DENY,
    };
    const result = checkDomainWithConfig('api.google.com', config);
    expect(result.action).toBe(DomainFilterAction.ALLOW);

    const denied = checkDomainWithConfig('evil.com', config);
    expect(denied.action).toBe(DomainFilterAction.DENY);
  });
});

describe('extractHostname', () => {
  it('extracts host from host:port format', () => {
    expect(extractHostname('example.com:443')).toBe('example.com');
  });

  it('returns raw value when no port', () => {
    expect(extractHostname('example.com')).toBe('example.com');
  });

  it('extracts hostname from full URL', () => {
    expect(extractHostname('https://example.com/path')).toBe('example.com');
    expect(extractHostname('http://api.example.com:8080/v1')).toBe('api.example.com');
  });

  it('handles IPv6 in host:port', () => {
    expect(extractHostname('[::1]:8080')).toBe('[::1]');
  });

  it('handles full IPv6 address in host:port', () => {
    expect(extractHostname('[2001:db8::1]:443')).toBe('[2001:db8::1]');
  });

  it('handles IPv6 in full URL', () => {
    expect(extractHostname('http://[::1]:3000/path')).toBe('[::1]');
  });

  it('returns input for unparseable values', () => {
    expect(extractHostname('not a url at all')).toBe('not a url at all');
  });
});

describe('extractPort', () => {
  it('extracts port from host:port format', () => {
    expect(extractPort('example.com:8080')).toBe(8080);
    expect(extractPort('example.com:443')).toBe(443);
  });

  it('returns default port when not specified', () => {
    expect(extractPort('example.com')).toBe(80);
    expect(extractPort('example.com', 443)).toBe(443);
  });

  it('extracts port from full URL', () => {
    expect(extractPort('http://example.com:9090/path')).toBe(9090);
    expect(extractPort('https://example.com/path')).toBe(443);
    expect(extractPort('http://example.com/path')).toBe(80);
  });

  it('extracts port from IPv6 host:port', () => {
    expect(extractPort('[::1]:8080')).toBe(8080);
    expect(extractPort('[2001:db8::1]:443')).toBe(443);
  });

  it('extracts port from IPv6 URL', () => {
    expect(extractPort('http://[::1]:3000/path')).toBe(3000);
  });
});
