/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AgyTrajectory {
  trajectoryId: string;
  cascadeId: string;
  trajectoryType: number;
  steps: unknown[];
}

export * from './teleporter.js';
export { convertAgyToCliRecord } from './converter.js';
