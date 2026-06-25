/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';

const GITHUB_SIGNATURE_HEADER_LENGTH = 71; // 'sha256=' (7) + 64 hex chars

/**
 * Verify that the payload was sent from GitHub using HMAC SHA256.
 *
 * @param payloadBody - The raw body of the request (Buffer or string).
 * @param signatureHeader - The value of the X-Hub-Signature-256 header.
 * @param secret - The GitHub Webhook secret.
 * @returns True if the signature is valid, false otherwise.
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export function verifyGithubSignature(
  payloadBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (
    !signatureHeader ||
    signatureHeader.length !== GITHUB_SIGNATURE_HEADER_LENGTH
  ) {
    return false;
  }

  if (!Buffer.isBuffer(payloadBody) && typeof payloadBody !== 'string') {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadBody);
  const expectedSignature = 'sha256=' + hmac.digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signatureHeader),
    );
  } catch (error) {
    console.error('Error verifying GitHub signature:', error);
    return false;
  }
}
