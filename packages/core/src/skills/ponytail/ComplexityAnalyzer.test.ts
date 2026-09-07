/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ComplexityAnalyzer } from './ComplexityAnalyzer.js';

describe('ComplexityAnalyzer', () => {
  it('detects trivial wrapper functions', () => {
    const analyzer = new ComplexityAnalyzer();
    const code = `
function getUserId(user: any) {
  return fetchUserId(user);
}
`;
    const findings = analyzer.analyze(code, 'utils.ts');
    expect(findings.some((f) => f.type === 'trivial-wrapper')).toBe(true);
    const wrapperFinding = findings.find((f) => f.type === 'trivial-wrapper');
    expect(wrapperFinding?.message).toContain("Trivial pass-through wrapper calling 'fetchUserId'");
  });

  it('detects dead commented-out code', () => {
    const analyzer = new ComplexityAnalyzer();
    const code = `
export function computeTotal(items: number[]) {
  // const temp = items.map(x => x * 2);
  return items.reduce((a, b) => a + b, 0);
}
`;
    const findings = analyzer.analyze(code, 'math.ts');
    expect(findings.some((f) => f.type === 'commented-code')).toBe(true);
  });

  it('detects empty interfaces', () => {
    const analyzer = new ComplexityAnalyzer();
    const code = `
interface EmptyConfig {}
interface SubConfig extends BaseConfig {}
`;
    const findings = analyzer.analyze(code, 'types.ts');
    expect(findings.filter((f) => f.type === 'empty-interface').length).toBe(2);
  });

  it('formats clean report when no complexity issues found', () => {
    const analyzer = new ComplexityAnalyzer();
    const report = analyzer.formatReport([]);
    expect(report).toContain('No gratuitous complexity');
  });
});
