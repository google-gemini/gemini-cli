/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function countMatchingIds<T extends { sessionId: string }>(
  items: T[],
  expectedIds: string[],
): number {
  const expected = new Set(expectedIds);
  return items.filter((item) => expected.has(item.sessionId)).length;
}

export function roundStat(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(4));
}

export function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function averageNullable(values: Array<number | null>): number | null {
  const numericValues = values.filter((value) => value !== null);
  return numericValues.length === 0 ? null : average(numericValues);
}
