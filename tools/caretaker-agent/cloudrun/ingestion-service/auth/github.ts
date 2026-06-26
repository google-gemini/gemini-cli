/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';

/**
 * Subset of the GitHub Webhook Payload for issues events.
 * @see https://docs.github.com/en/webhooks/webhook-events-and-payloads#issues
 */
export interface GitHubWebhookPayload {
  action: string;
  issue: {
    body?: string | null; // Can be null if description is empty
    number: number;
    title?: string;
  };
  repository: {
    /** Expected format: "owner/repo" (e.g. "google-gemini/gemini-cli") */
    full_name: string;
  };
  sender?: {
    login?: string;
  };
}

/** Regular expression matching standard GitHub repository format "owner/repo" */
const GITHUB_REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

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

/**
 * Type guard to verify that an unknown object conforms to the GitHubWebhookPayload structure.
 *
 * @param obj - The object to validate.
 * @returns True if the object matches the schema, false otherwise.
 */
export function isGitHubWebhookPayload(
  obj: unknown,
): obj is GitHubWebhookPayload {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const o = obj as GitHubWebhookPayload;

  // 1. Validate 'action'
  if (typeof o.action !== 'string') {
    return false;
  }

  // 2. Validate 'issue'
  if (typeof o.issue !== 'object' || o.issue === null) {
    return false;
  }
  if (typeof o.issue.number !== 'number') {
    return false;
  }
  if (
    o.issue.body !== undefined &&
    o.issue.body !== null &&
    typeof o.issue.body !== 'string'
  ) {
    return false;
  }
  if (o.issue.title !== undefined && typeof o.issue.title !== 'string') {
    return false;
  }

  // 3. Validate 'repository'
  if (typeof o.repository !== 'object' || o.repository === null) {
    return false;
  }
  if (typeof o.repository.full_name !== 'string') {
    return false;
  }
  if (!GITHUB_REPO_REGEX.test(o.repository.full_name)) {
    return false;
  }

  // 4. Validate 'sender' (optional)
  if (o.sender !== undefined) {
    if (typeof o.sender !== 'object' || o.sender === null) {
      return false;
    }
    if (o.sender.login !== undefined && typeof o.sender.login !== 'string') {
      return false;
    }
  }

  return true;
}
