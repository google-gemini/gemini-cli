/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ArchifyPolicy } from './ArchifyPolicy.js';

describe('ArchifyPolicy', () => {
  it('has correct intent, name, and visual directives', () => {
    const policy = new ArchifyPolicy();
    expect(policy.intent).toBe('archify');
    expect(policy.name).toBe('Archify Visual Reasoner');
    expect(policy.description).toContain('ASCII/Unicode box-drawing diagrams');

    const directives = policy.getDirectives();
    expect(directives).toContain('THINK SPATIALLY & ARCHITECTURALLY');
    expect(directives).toContain('SHOW SYSTEM TOPOLOGY & COMPONENT BOUNDARIES');
    expect(directives).toContain('EXPLAIN THE "WHY" BEHIND THE TOPOLOGY');
  });
});
