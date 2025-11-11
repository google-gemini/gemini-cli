/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';

/**
 * Secure random number generation utilities.
 *
 * SECURITY NOTE: Math.random() is NOT cryptographically secure and should
 * NEVER be used for security-sensitive operations like generating tokens,
 * IDs, session identifiers, or any value used for authentication/authorization.
 *
 * This module provides cryptographically secure random number generation
 * using Node.js crypto.randomBytes().
 */

/**
 * Generates a cryptographically secure random integer between min and max (inclusive).
 *
 * @param min Minimum value (inclusive)
 * @param max Maximum value (inclusive)
 * @returns Secure random integer
 */
export function secureRandomInt(min: number, max: number): number {
  if (min > max) {
    throw new Error('min must be less than or equal to max');
  }

  const range = max - min + 1;

  // Calculate how many bytes we need
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);

  // Generate random bytes
  const randomBytes = crypto.randomBytes(bytesNeeded);

  // Convert to number
  let randomValue = 0;
  for (let i = 0; i < bytesNeeded; i++) {
    randomValue = (randomValue << 8) + randomBytes[i];
  }

  // Map to range using rejection sampling to avoid modulo bias
  const maxValue = Math.pow(256, bytesNeeded);
  const validRange = Math.floor(maxValue / range) * range;

  if (randomValue >= validRange) {
    // Reject and try again to avoid bias
    return secureRandomInt(min, max);
  }

  return min + (randomValue % range);
}

/**
 * Generates a cryptographically secure random float between 0 (inclusive) and 1 (exclusive).
 *
 * @returns Secure random float
 */
export function secureRandomFloat(): number {
  // Generate 8 random bytes (64 bits)
  const bytes = crypto.randomBytes(8);

  // Convert to a number between 0 and 1
  let value = 0;
  for (let i = 0; i < 8; i++) {
    value = value * 256 + bytes[i];
  }

  // Divide by maximum possible value to get float between 0 and 1
  return value / Math.pow(256, 8);
}

/**
 * Generates a cryptographically secure random ID.
 *
 * @param length Length of the ID (default: 16)
 * @param charset Character set to use (default: alphanumeric)
 * @returns Secure random ID
 */
export function secureRandomID(
  length: number = 16,
  charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
): string {
  const bytes = crypto.randomBytes(length);
  const charsetLength = charset.length;

  let result = '';
  for (let i = 0; i < length; i++) {
    // Use rejection sampling to avoid modulo bias
    const byte = bytes[i];
    const maxValid = 256 - (256 % charsetLength);

    if (byte < maxValid) {
      result += charset[byte % charsetLength];
    } else {
      // Reject and get a new byte
      const newByte = crypto.randomBytes(1)[0];
      result += charset[newByte % charsetLength];
    }
  }

  return result;
}

/**
 * Generates a cryptographically secure random hex string.
 *
 * @param length Length of the hex string (default: 32)
 * @returns Secure random hex string
 */
export function secureRandomHex(length: number = 32): string {
  const bytes = crypto.randomBytes(Math.ceil(length / 2));
  return bytes.toString('hex').substring(0, length);
}

/**
 * Generates a cryptographically secure random base64 string.
 *
 * @param length Approximate length of the base64 string (default: 32)
 * @returns Secure random base64 string
 */
export function secureRandomBase64(length: number = 32): string {
  const bytes = crypto.randomBytes(Math.ceil((length * 3) / 4));
  return bytes.toString('base64').substring(0, length);
}

/**
 * Securely shuffles an array using the Fisher-Yates algorithm
 * with cryptographically secure random numbers.
 *
 * @param array Array to shuffle (modified in place)
 * @returns The shuffled array
 */
export function secureArrayShuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = secureRandomInt(0, i);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Securely selects a random element from an array.
 *
 * @param array Array to select from
 * @returns Random element from the array
 */
export function secureRandomChoice<T>(array: T[]): T {
  if (array.length === 0) {
    throw new Error('Cannot select from empty array');
  }
  const index = secureRandomInt(0, array.length - 1);
  return array[index];
}

/**
 * Generates a cryptographically secure UUID v4.
 *
 * @returns UUID v4 string
 */
export function secureUUIDv4(): string {
  const bytes = crypto.randomBytes(16);

  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

  // Format as UUID
  const hex = bytes.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}

/**
 * Generates a cryptographically secure random token suitable for
 * session IDs, CSRF tokens, etc.
 *
 * @param bytes Number of random bytes (default: 32)
 * @returns URL-safe random token
 */
export function secureRandomToken(bytes: number = 32): string {
  return crypto
    .randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generates a cryptographically secure random password.
 *
 * @param length Length of the password (default: 16)
 * @param options Password generation options
 * @returns Secure random password
 */
export function secureRandomPassword(
  length: number = 16,
  options: {
    uppercase?: boolean;
    lowercase?: boolean;
    numbers?: boolean;
    symbols?: boolean;
  } = {},
): string {
  const {
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
  } = options;

  let charset = '';
  if (uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (lowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (numbers) charset += '0123456789';
  if (symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (charset.length === 0) {
    throw new Error('At least one character set must be enabled');
  }

  return secureRandomID(length, charset);
}
