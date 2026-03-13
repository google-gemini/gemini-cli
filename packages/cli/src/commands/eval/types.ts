/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ExpectedBehavior {
  must_include?: string[];
  must_not_include?: string[];
}

export interface TestCase {
  name: string;
  input: string;
  expected_behavior: ExpectedBehavior;
}

export interface CheckResult {
  label: string;
  passed: boolean;
}

export interface EvalResult {
  name: string;
  passed: number;
  total: number;
  status: 'PASS' | 'FAIL';
  details: CheckResult[];
}
