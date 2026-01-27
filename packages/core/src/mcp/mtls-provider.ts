/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Provider for Mutual TLS (mTLS) certificate-based authentication.
 */

import * as https from 'node:https';
import * as fs from 'node:fs';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Configuration for mTLS client certificate authentication.
 */
export interface MTLSConfig {
  certPath: string;
  keyPath: string;
  passphrase?: string;
}

/**
 * Load and validate client certificate and key files for mTLS.
 *
 * @param config mTLS configuration with certificate paths
 * @returns Object containing certificate and key buffers
 * @throws Error if files cannot be read or are invalid
 */
export function loadClientCertificate(config: MTLSConfig): {
  cert: Buffer;
  key: Buffer;
  passphrase?: string;
} {
  debugLogger.debug(`Loading mTLS client certificate from: ${config.certPath}`);

  try {
    // Check if certificate file exists
    if (!fs.existsSync(config.certPath)) {
      throw new Error(`Certificate file not found: ${config.certPath}`);
    }

    // Check if key file exists
    if (!fs.existsSync(config.keyPath)) {
      throw new Error(`Private key file not found: ${config.keyPath}`);
    }

    // Read certificate file
    const cert = fs.readFileSync(config.certPath);
    debugLogger.debug('✓ Certificate file loaded successfully');

    // Read private key file
    const key = fs.readFileSync(config.keyPath);
    debugLogger.debug('✓ Private key file loaded successfully');

    // Basic validation: check if files are not empty
    if (cert.length === 0) {
      throw new Error(`Certificate file is empty: ${config.certPath}`);
    }

    if (key.length === 0) {
      throw new Error(`Private key file is empty: ${config.keyPath}`);
    }

    // Basic PEM format validation
    const certStr = cert.toString('utf8');
    const keyStr = key.toString('utf8');

    if (!certStr.includes('BEGIN CERTIFICATE')) {
      throw new Error(
        `Invalid certificate format (expected PEM): ${config.certPath}`,
      );
    }

    if (
      !keyStr.includes('BEGIN PRIVATE KEY') &&
      !keyStr.includes('BEGIN RSA PRIVATE KEY') &&
      !keyStr.includes('BEGIN EC PRIVATE KEY') &&
      !keyStr.includes('BEGIN ENCRYPTED PRIVATE KEY')
    ) {
      throw new Error(
        `Invalid private key format (expected PEM): ${config.keyPath}`,
      );
    }

    return {
      cert,
      key,
      passphrase: config.passphrase,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load mTLS certificate: ${error.message}`);
    }
    throw new Error(`Failed to load mTLS certificate: ${String(error)}`);
  }
}

/**
 * Create an HTTPS agent configured for mTLS authentication.
 *
 * @param config mTLS configuration with certificate paths
 * @returns Configured HTTPS agent for use with fetch or HTTP clients
 * @throws Error if certificate loading fails
 */
export function createMTLSAgent(config: MTLSConfig): https.Agent {
  debugLogger.debug('Creating mTLS HTTPS agent');

  const credentials = loadClientCertificate(config);

  const agent = new https.Agent({
    cert: credentials.cert,
    key: credentials.key,
    passphrase: credentials.passphrase,
    rejectUnauthorized: true, // Always validate server certificate
    keepAlive: true, // Reuse connections
  });

  debugLogger.debug('✓ mTLS HTTPS agent created successfully');
  return agent;
}

/**
 * Validate mTLS configuration before attempting to load certificates.
 *
 * @param config mTLS configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateMTLSConfig(config: MTLSConfig): void {
  if (!config.certPath || config.certPath.trim() === '') {
    throw new Error('mTLS certificate path (certPath) is required');
  }

  if (!config.keyPath || config.keyPath.trim() === '') {
    throw new Error('mTLS private key path (keyPath) is required');
  }

  // Check if paths are absolute (recommended for security)
  if (!config.certPath.startsWith('/') && !config.certPath.match(/^[A-Z]:\\/)) {
    debugLogger.warn(
      `Certificate path is relative: ${config.certPath}. Consider using absolute paths for security.`,
    );
  }

  if (!config.keyPath.startsWith('/') && !config.keyPath.match(/^[A-Z]:\\/)) {
    debugLogger.warn(
      `Private key path is relative: ${config.keyPath}. Consider using absolute paths for security.`,
    );
  }
}
