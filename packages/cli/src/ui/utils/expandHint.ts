/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

interface ExpandHintAutoTriggerParams {
  constrainHeight: boolean;
  overflowingIdsSize: number;
  previousOverflowingIdsSize: number;
}

export function shouldAutoTriggerExpandHint({
  constrainHeight,
  overflowingIdsSize,
  previousOverflowingIdsSize,
}: ExpandHintAutoTriggerParams): boolean {
  return constrainHeight && overflowingIdsSize > previousOverflowingIdsSize;
}
