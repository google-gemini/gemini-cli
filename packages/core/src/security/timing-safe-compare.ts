/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import { logConfigTamperingDetected } from './security-audit-logger.js';

/**
 * Timing-safe comparison utilities to prevent timing attacks.
 *
 * SECURITY NOTE: Using === or == for comparing secrets (passwords, tokens,
 * API keys, etc.) is vulnerable to timing attacks. Attackers can measure
 * how long comparisons take to determine if they're on the right track,
 * leaking information character by character.
 *
 * Example timing attack:
 * - "a" === "x" returns fast (first char doesn't match)
 * - "abc" === "axc" returns slower (first char matches, second doesn't)
 * - Attacker measures time differences to guess correct values
 *
 * This module provides constant-time comparison to prevent timing attacks.
 */

/**
 * Performs a timing-safe comparison of two strings.
 *
 * Uses Node.js crypto.timingSafeEqual which compares buffers in constant time,
 * ensuring the comparison time is independent of the input values.
 *
 * @param a First string to compare
 * @param b Second string to compare
 * @returns True if strings are equal, false otherwise
 */
export function timingSafeEqual(a: string, b: string): boolean {
  try {
    // Convert strings to buffers
    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');

    // If lengths differ, still do a comparison to maintain constant time
    // but with a dummy buffer to prevent length-based timing leaks
    if (bufferA.length !== bufferB.length) {
      // Compare with a dummy buffer of the same length
      const dummyBuffer = Buffer.alloc(bufferA.length);
      crypto.timingSafeEqual(bufferA, dummyBuffer);
      return false;
    }

    // Perform timing-safe comparison
    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch (error) {
    // Any error means not equal
    return false;
  }
}

/**
 * Performs a timing-safe comparison of two buffers.
 *
 * @param a First buffer to compare
 * @param b Second buffer to compare
 * @returns True if buffers are equal, false otherwise
 */
export function timingSafeEqualBuffer(a: Buffer, b: Buffer): boolean {
  try {
    if (a.length !== b.length) {
      // Still do a comparison to maintain constant time
      const dummyBuffer = Buffer.alloc(a.length);
      crypto.timingSafeEqual(a, dummyBuffer);
      return false;
    }

    return crypto.timingSafeEqual(a, b);
  } catch (error) {
    return false;
  }
}

/**
 * Verifies a password against a hash in a timing-safe manner.
 *
 * This is a placeholder for proper password hashing (should use bcrypt, argon2, etc.)
 * but demonstrates the timing-safe comparison principle.
 *
 * @param password Plain text password
 * @param hash Password hash to compare against
 * @returns True if password matches hash
 */
export function verifyPassword(password: string, hash: string): boolean {
  return timingSafeEqual(password, hash);
}

/**
 * Verifies an API token or OAuth token in a timing-safe manner.
 *
 * @param providedToken Token provided by the user/client
 * @param expectedToken Expected token value
 * @returns True if tokens match
 */
export function verifyToken(
  providedToken: string,
  expectedToken: string,
): boolean {
  // Log potential token verification failures
  const result = timingSafeEqual(providedToken, expectedToken);

  if (!result) {
    logConfigTamperingDetected(
      'Token verification',
      'Token verification failed - potential unauthorized access attempt',
    );
  }

  return result;
}

/**
 * Verifies an API key in a timing-safe manner.
 *
 * @param providedKey API key provided by the user/client
 * @param expectedKey Expected API key value
 * @returns True if API keys match
 */
export function verifyApiKey(
  providedKey: string,
  expectedKey: string,
): boolean {
  const result = timingSafeEqual(providedKey, expectedKey);

  if (!result) {
    logConfigTamperingDetected(
      'API key verification',
      'API key verification failed - potential unauthorized access attempt',
    );
  }

  return result;
}

/**
 * Verifies a CSRF token in a timing-safe manner.
 *
 * @param providedToken CSRF token from request
 * @param expectedToken Expected CSRF token
 * @returns True if tokens match
 */
export function verifyCsrfToken(
  providedToken: string,
  expectedToken: string,
): boolean {
  return timingSafeEqual(providedToken, expectedToken);
}

/**
 * Verifies a session ID in a timing-safe manner.
 *
 * @param providedSessionId Session ID from request
 * @param expectedSessionId Expected session ID
 * @returns True if session IDs match
 */
export function verifySessionId(
  providedSessionId: string,
  expectedSessionId: string,
): boolean {
  const result = timingSafeEqual(providedSessionId, expectedSessionId);

  if (!result) {
    logConfigTamperingDetected(
      'Session verification',
      'Session ID verification failed - potential session hijacking attempt',
    );
  }

  return result;
}

/**
 * Compares two HMACs in a timing-safe manner.
 *
 * @param hmac1 First HMAC
 * @param hmac2 Second HMAC
 * @returns True if HMACs match
 */
export function compareHmac(hmac1: string, hmac2: string): boolean {
  return timingSafeEqual(hmac1, hmac2);
}

/**
 * Verifies a message authentication code (MAC) in a timing-safe manner.
 *
 * @param message Original message
 * @param providedMac MAC provided with the message
 * @param secret Secret key for MAC generation
 * @returns True if MAC is valid
 */
export function verifyMac(
  message: string,
  providedMac: string,
  secret: string,
): boolean {
  // Generate expected MAC
  const expectedMac = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  // Compare in constant time
  return timingSafeEqual(providedMac, expectedMac);
}

/**
 * Verifies a JWT signature in a timing-safe manner.
 * Note: This is a simplified version. In production, use a proper JWT library.
 *
 * @param token JWT token
 * @param secret Secret key
 * @returns True if signature is valid
 */
export function verifyJwtSignature(token: string, secret: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    const [header, payload, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return timingSafeEqual(signature, expectedSignature);
  } catch (error) {
    return false;
  }
}

/**
 * Creates a secure comparison function with automatic logging.
 *
 * @param secretType Type of secret being compared (for logging)
 * @returns Comparison function
 */
export function createSecureComparator(
  secretType: string,
): (a: string, b: string) => boolean {
  return (a: string, b: string): boolean => {
    const result = timingSafeEqual(a, b);

    if (!result) {
      logConfigTamperingDetected(
        secretType,
        `${secretType} verification failed - potential timing attack`,
      );
    }

    return result;
  };
}
