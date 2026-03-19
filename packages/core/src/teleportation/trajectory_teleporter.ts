/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import * as crypto from 'node:crypto';
import { Trajectory } from './exa/proto_ts/dist/exa/gemini_coder/proto/trajectory_pb.js';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

const DEFAULT_KEY = Buffer.from('safeCodeiumworldKeYsecretBalloon');
const NONCE_SIZE = 12; // GCM default nonce size
const TAG_SIZE = 16; // GCM default tag size

/**
 * Decrypts data using AES-256-GCM.
 * The data is expected to be in the format: [nonce (12b)][ciphertext][tag (16b)]
 */
export function decrypt(data: Buffer, key: Buffer = DEFAULT_KEY): Buffer {
  if (data.length < NONCE_SIZE + TAG_SIZE) {
    throw new Error('Data too short');
  }

  const nonce = data.subarray(0, NONCE_SIZE);
  const tag = data.subarray(data.length - TAG_SIZE);
  const ciphertext = data.subarray(NONCE_SIZE, data.length - TAG_SIZE);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Encrypts data using AES-256-GCM.
 * Returns data in the format: [nonce (12b)][ciphertext][tag (16b)]
 */
export function encrypt(data: Buffer, key: Buffer = DEFAULT_KEY): Buffer {
  const nonce = crypto.randomBytes(NONCE_SIZE);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);

  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([nonce, ciphertext, tag]);
}

/**
 * Converts Antigravity binary trajectory to JSON.
 */
export function trajectoryToJson(
  data: Buffer,
  key: Buffer = DEFAULT_KEY,
): unknown {
  let pbData: Buffer;
  try {
    // Try to decrypt first
    pbData = decrypt(data, key);
  } catch (_e) {
    // Fallback to plain protobuf if decryption fails
    pbData = data;
  }

  const trajectory = Trajectory.fromBinary(pbData);
  return trajectory.toJson();
}

/**
 * Converts JSON to Antigravity binary trajectory (encrypted).
 */
export function jsonToTrajectory(
  json: unknown,
  key: Buffer = DEFAULT_KEY,
): Buffer {
  const trajectory = Trajectory.fromJson(json, { ignoreUnknownFields: true });
  const pbData = Buffer.from(trajectory.toBinary());
  return encrypt(pbData, key);
}
