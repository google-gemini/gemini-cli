/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as teleporter from './trajectory_teleporter.min.js';

/**
 * Decrypts and parses an Antigravity trajectory file (.pb) into JSON.
 */
export function trajectoryToJson(data: Buffer): unknown {
  return teleporter.trajectoryToJson(data);
}

/**
 * Converts a JSON trajectory back to encrypted binary format.
 */
export function jsonToTrajectory(json: unknown): Buffer {
  return teleporter.jsonToTrajectory(json);
}
