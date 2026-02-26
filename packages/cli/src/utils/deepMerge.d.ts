/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { MergeStrategy } from '../config/settingsSchema.js';
export type Mergeable =
  | string
  | number
  | boolean
  | null
  | undefined
  | object
  | Mergeable[];
export type MergeableObject = Record<string, Mergeable>;
export declare function customDeepMerge(
  getMergeStrategyForPath: (path: string[]) => MergeStrategy | undefined,
  ...sources: MergeableObject[]
): MergeableObject;
