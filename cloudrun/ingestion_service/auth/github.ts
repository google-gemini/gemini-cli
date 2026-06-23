import * as crypto from 'node:crypto';

/**
 * Verify that the payload was sent from GitHub using HMAC SHA256.
 *
 * @param payloadBody - The raw body of the request (Buffer or string).
 * @param signatureHeader - The value of the X-Hub-Signature-256 header.
 * @param secret - The GitHub Webhook secret.
 * @returns True if the signature is valid, false otherwise.
 */
export function verifyGithubSignature(
  payloadBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || signatureHeader.length !== 71) {
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
  } catch {
    return false;
  }
}
