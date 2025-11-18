/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  PolicyDecision,
  type PolicyRule,
  type PolicyEngineConfig,
} from './types.js';

describe('policy types', () => {
  describe('PolicyDecision enum', () => {
    it('should have ALLOW decision', () => {
      expect(PolicyDecision.ALLOW).toBe('allow');
    });

    it('should have DENY decision', () => {
      expect(PolicyDecision.DENY).toBe('deny');
    });

    it('should have ASK_USER decision', () => {
      expect(PolicyDecision.ASK_USER).toBe('ask_user');
    });

    it('should have exactly 3 decision types', () => {
      const decisions = Object.keys(PolicyDecision);
      expect(decisions).toHaveLength(3);
    });

    it('should use lowercase values', () => {
      const values = Object.values(PolicyDecision);
      values.forEach((value) => {
        expect(value).toBe(value.toLowerCase());
      });
    });

    it('should use snake_case for ASK_USER', () => {
      expect(PolicyDecision.ASK_USER).toMatch(/_/);
    });
  });

  describe('PolicyRule interface', () => {
    it('should accept minimal rule with just decision', () => {
      const rule: PolicyRule = {
        decision: PolicyDecision.ALLOW,
      };

      expect(rule.decision).toBe('allow');
    });

    it('should accept rule with toolName', () => {
      const rule: PolicyRule = {
        toolName: 'readFile',
        decision: PolicyDecision.ASK_USER,
      };

      expect(rule.toolName).toBe('readFile');
      expect(rule.decision).toBe('ask_user');
    });

    it('should accept rule with argsPattern', () => {
      const pattern = /sensitive/;
      const rule: PolicyRule = {
        argsPattern: pattern,
        decision: PolicyDecision.DENY,
      };

      expect(rule.argsPattern).toBe(pattern);
      expect(rule.argsPattern?.test('sensitive data')).toBe(true);
    });

    it('should accept rule with priority', () => {
      const rule: PolicyRule = {
        decision: PolicyDecision.ALLOW,
        priority: 10,
      };

      expect(rule.priority).toBe(10);
    });

    it('should accept rule with all fields', () => {
      const rule: PolicyRule = {
        toolName: 'executeCommand',
        argsPattern: /rm -rf/,
        decision: PolicyDecision.DENY,
        priority: 100,
      };

      expect(rule.toolName).toBe('executeCommand');
      expect(rule.argsPattern).toBeDefined();
      expect(rule.decision).toBe('deny');
      expect(rule.priority).toBe(100);
    });

    it('should work with undefined toolName', () => {
      const rule: PolicyRule = {
        toolName: undefined,
        decision: PolicyDecision.ALLOW,
      };

      expect(rule.toolName).toBeUndefined();
    });

    it('should work with different priority values', () => {
      const lowPriority: PolicyRule = {
        decision: PolicyDecision.ASK_USER,
        priority: 0,
      };

      const highPriority: PolicyRule = {
        decision: PolicyDecision.DENY,
        priority: 999,
      };

      expect(lowPriority.priority).toBe(0);
      expect(highPriority.priority).toBe(999);
    });

    it('should work with negative priority', () => {
      const rule: PolicyRule = {
        decision: PolicyDecision.ALLOW,
        priority: -1,
      };

      expect(rule.priority).toBe(-1);
    });

    it('should support regex pattern matching', () => {
      const rule: PolicyRule = {
        argsPattern: /^\/etc\//,
        decision: PolicyDecision.DENY,
      };

      expect(rule.argsPattern?.test('/etc/passwd')).toBe(true);
      expect(rule.argsPattern?.test('/home/user')).toBe(false);
    });
  });

  describe('PolicyEngineConfig interface', () => {
    it('should accept empty config', () => {
      const config: PolicyEngineConfig = {};

      expect(config.rules).toBeUndefined();
      expect(config.defaultDecision).toBeUndefined();
      expect(config.nonInteractive).toBeUndefined();
    });

    it('should accept config with rules', () => {
      const config: PolicyEngineConfig = {
        rules: [
          { decision: PolicyDecision.ALLOW },
          { decision: PolicyDecision.DENY, toolName: 'dangerous' },
        ],
      };

      expect(config.rules).toHaveLength(2);
    });

    it('should accept config with defaultDecision', () => {
      const config: PolicyEngineConfig = {
        defaultDecision: PolicyDecision.ASK_USER,
      };

      expect(config.defaultDecision).toBe('ask_user');
    });

    it('should accept config with nonInteractive flag', () => {
      const config: PolicyEngineConfig = {
        nonInteractive: true,
      };

      expect(config.nonInteractive).toBe(true);
    });

    it('should accept full config', () => {
      const config: PolicyEngineConfig = {
        rules: [
          {
            toolName: 'readFile',
            argsPattern: /\.env/,
            decision: PolicyDecision.DENY,
            priority: 100,
          },
          {
            toolName: 'writeFile',
            decision: PolicyDecision.ASK_USER,
            priority: 50,
          },
        ],
        defaultDecision: PolicyDecision.DENY,
        nonInteractive: false,
      };

      expect(config.rules).toHaveLength(2);
      expect(config.defaultDecision).toBe('deny');
      expect(config.nonInteractive).toBe(false);
    });

    it('should accept empty rules array', () => {
      const config: PolicyEngineConfig = {
        rules: [],
      };

      expect(config.rules).toEqual([]);
    });

    it('should support all decision types as default', () => {
      const configs = [
        { defaultDecision: PolicyDecision.ALLOW },
        { defaultDecision: PolicyDecision.DENY },
        { defaultDecision: PolicyDecision.ASK_USER },
      ];

      configs.forEach((config) => {
        expect(config.defaultDecision).toBeDefined();
      });
    });
  });

  describe('practical usage scenarios', () => {
    it('should allow creating security-focused config', () => {
      const securityConfig: PolicyEngineConfig = {
        rules: [
          {
            toolName: 'executeShell',
            decision: PolicyDecision.DENY,
            priority: 100,
          },
          {
            argsPattern: /password|secret|api[_-]key/i,
            decision: PolicyDecision.DENY,
            priority: 90,
          },
        ],
        defaultDecision: PolicyDecision.ASK_USER,
        nonInteractive: false,
      };

      expect(securityConfig.rules?.length).toBe(2);
      expect(securityConfig.defaultDecision).toBe('ask_user');
    });

    it('should allow creating permissive config', () => {
      const permissiveConfig: PolicyEngineConfig = {
        defaultDecision: PolicyDecision.ALLOW,
        nonInteractive: true,
      };

      expect(permissiveConfig.defaultDecision).toBe('allow');
      expect(permissiveConfig.nonInteractive).toBe(true);
    });

    it('should support priority-based rule ordering', () => {
      const config: PolicyEngineConfig = {
        rules: [
          { decision: PolicyDecision.DENY, priority: 1 },
          { decision: PolicyDecision.ALLOW, priority: 10 },
          { decision: PolicyDecision.ASK_USER, priority: 5 },
        ],
      };

      const sorted = config.rules?.sort(
        (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
      );

      expect(sorted?.[0].priority).toBe(10);
      expect(sorted?.[1].priority).toBe(5);
      expect(sorted?.[2].priority).toBe(1);
    });

    it('should handle nonInteractive mode affecting ASK_USER', () => {
      const config: PolicyEngineConfig = {
        defaultDecision: PolicyDecision.ASK_USER,
        nonInteractive: true,
      };

      // In non-interactive mode, ASK_USER should become DENY
      const effectiveDecision =
        config.nonInteractive &&
        config.defaultDecision === PolicyDecision.ASK_USER
          ? PolicyDecision.DENY
          : config.defaultDecision;

      expect(effectiveDecision).toBe('deny');
    });

    it('should allow regex-based content filtering', () => {
      const rule: PolicyRule = {
        argsPattern: /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
        decision: PolicyDecision.DENY,
        priority: 100,
      };

      expect(rule.argsPattern?.test('SSN: 123-45-6789')).toBe(true);
      expect(rule.argsPattern?.test('Safe content')).toBe(false);
    });
  });

  describe('type combinations', () => {
    it('should allow multiple rules for same tool', () => {
      const config: PolicyEngineConfig = {
        rules: [
          {
            toolName: 'fileOp',
            argsPattern: /read/,
            decision: PolicyDecision.ALLOW,
          },
          {
            toolName: 'fileOp',
            argsPattern: /delete/,
            decision: PolicyDecision.DENY,
          },
        ],
      };

      expect(config.rules?.every((r) => r.toolName === 'fileOp')).toBe(true);
    });

    it('should allow undefined optional fields', () => {
      const rule: PolicyRule = {
        decision: PolicyDecision.ALLOW,
        toolName: undefined,
        argsPattern: undefined,
        priority: undefined,
      };

      expect(rule.toolName).toBeUndefined();
      expect(rule.argsPattern).toBeUndefined();
      expect(rule.priority).toBeUndefined();
    });
  });
});
