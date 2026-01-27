/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import {
  loadClientCertificate,
  createMTLSAgent,
  validateMTLSConfig,
  type MTLSConfig,
} from './mtls-provider.js';

// Mock fs module
vi.mock('node:fs');

describe('mTLS Provider', () => {
  const mockCert = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKL0UG+mRKuFMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMTYwODI4MTIwMDAwWhcNMjYwODI4MTIwMDAwWjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEAvNC/KEQM8eBb+4y0SBYz3kXYB8xMEWWL3kO2RGklYOVF+DRe6W1aQxUh
test-certificate-content
-----END CERTIFICATE-----`;

  const mockKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC80L8oRAzx4Fv7
test-private-key-content
-----END PRIVATE KEY-----`;

  const mockEncryptedKey = `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFHDBOBgkqhkiG9w0BBQ0wQTApBgkqhkiG9w0BBQwwHAQITest encrypted key
-----END ENCRYPTED PRIVATE KEY-----`;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadClientCertificate', () => {
    it('should successfully load valid PEM certificate and key', () => {
      const config: MTLSConfig = {
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/key.pem',
      };

      vi.mocked(fs.existsSync).mockImplementation((_path) => true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/cert.pem') return Buffer.from(mockCert);
        if (path === '/path/to/key.pem') return Buffer.from(mockKey);
        return Buffer.alloc(0);
      });

      const result = loadClientCertificate(config);

      expect(result.cert).toBeInstanceOf(Buffer);
      expect(result.key).toBeInstanceOf(Buffer);
      expect(result.passphrase).toBeUndefined();
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/cert.pem');
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/key.pem');
    });

    it('should load certificate with passphrase', () => {
      const config: MTLSConfig = {
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/key.pem',
        passphrase: 'my-secret-passphrase',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/cert.pem') return Buffer.from(mockCert);
        if (path === '/path/to/key.pem') return Buffer.from(mockEncryptedKey);
        return Buffer.alloc(0);
      });

      const result = loadClientCertificate(config);

      expect(result.cert).toBeInstanceOf(Buffer);
      expect(result.key).toBeInstanceOf(Buffer);
      expect(result.passphrase).toBe('my-secret-passphrase');
    });

    it('should throw error if certificate file does not exist', () => {
      const config: MTLSConfig = {
        certPath: '/nonexistent/cert.pem',
        keyPath: '/path/to/key.pem',
      };

      vi.mocked(fs.existsSync).mockImplementation(
        (path) => path !== '/nonexistent/cert.pem',
      );

      expect(() => loadClientCertificate(config)).toThrow(
        'Certificate file not found: /nonexistent/cert.pem',
      );
    });

    it('should throw error if key file does not exist', () => {
      const config: MTLSConfig = {
        certPath: '/path/to/cert.pem',
        keyPath: '/nonexistent/key.pem',
      };

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/path/to/cert.pem') return true;
        if (path === '/nonexistent/key.pem') return false;
        return false;
      });

      expect(() => loadClientCertificate(config)).toThrow(
        'Private key file not found: /nonexistent/key.pem',
      );
    });

    it('should throw error if certificate file is empty', () => {
      const config: MTLSConfig = {
        certPath: '/path/to/empty-cert.pem',
        keyPath: '/path/to/key.pem',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/empty-cert.pem') return Buffer.alloc(0);
        if (path === '/path/to/key.pem') return Buffer.from(mockKey);
        return Buffer.alloc(0);
      });

      expect(() => loadClientCertificate(config)).toThrow(
        'Certificate file is empty',
      );
    });

    it('should throw error if key file is empty', () => {
      const config: MTLSConfig = {
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/empty-key.pem',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/cert.pem') return Buffer.from(mockCert);
        if (path === '/path/to/empty-key.pem') return Buffer.alloc(0);
        return Buffer.alloc(0);
      });

      expect(() => loadClientCertificate(config)).toThrow(
        'Private key file is empty',
      );
    });

    it('should throw error if certificate has invalid PEM format', () => {
      const config: MTLSConfig = {
        certPath: '/path/to/invalid-cert.pem',
        keyPath: '/path/to/key.pem',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/invalid-cert.pem')
          return Buffer.from('not a certificate');
        if (path === '/path/to/key.pem') return Buffer.from(mockKey);
        return Buffer.alloc(0);
      });

      expect(() => loadClientCertificate(config)).toThrow(
        'Invalid certificate format (expected PEM)',
      );
    });

    it('should throw error if key has invalid PEM format', () => {
      const config: MTLSConfig = {
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/invalid-key.pem',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/cert.pem') return Buffer.from(mockCert);
        if (path === '/path/to/invalid-key.pem')
          return Buffer.from('not a private key');
        return Buffer.alloc(0);
      });

      expect(() => loadClientCertificate(config)).toThrow(
        'Invalid private key format (expected PEM)',
      );
    });

    it('should accept various private key formats', () => {
      const rsaKey =
        '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';
      const ecKey =
        '-----BEGIN EC PRIVATE KEY-----\ntest\n-----END EC PRIVATE KEY-----';

      const testCases = [
        { key: mockKey, name: 'PRIVATE KEY' },
        { key: rsaKey, name: 'RSA PRIVATE KEY' },
        { key: ecKey, name: 'EC PRIVATE KEY' },
        { key: mockEncryptedKey, name: 'ENCRYPTED PRIVATE KEY' },
      ];

      testCases.forEach(({ key, name }) => {
        const config: MTLSConfig = {
          certPath: '/path/to/cert.pem',
          keyPath: `/path/to/${name.toLowerCase().replace(/ /g, '-')}.pem`,
        };

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((path) => {
          if (path === '/path/to/cert.pem') return Buffer.from(mockCert);
          return Buffer.from(key);
        });

        expect(() => loadClientCertificate(config)).not.toThrow();
      });
    });
  });

  describe('createMTLSAgent', () => {
    it('should create HTTPS agent with client certificates', () => {
      const config: MTLSConfig = {
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/key.pem',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/cert.pem') return Buffer.from(mockCert);
        if (path === '/path/to/key.pem') return Buffer.from(mockKey);
        return Buffer.alloc(0);
      });

      const agent = createMTLSAgent(config);

      expect(agent).toBeDefined();
      expect(agent.options.cert).toBeInstanceOf(Buffer);
      expect(agent.options.key).toBeInstanceOf(Buffer);
      expect(agent.options.rejectUnauthorized).toBe(true);
      expect(agent.options.keepAlive).toBe(true);
    });

    it('should create HTTPS agent with passphrase', () => {
      const config: MTLSConfig = {
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/key.pem',
        passphrase: 'my-passphrase',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/cert.pem') return Buffer.from(mockCert);
        if (path === '/path/to/key.pem') return Buffer.from(mockEncryptedKey);
        return Buffer.alloc(0);
      });

      const agent = createMTLSAgent(config);

      expect(agent.options.passphrase).toBe('my-passphrase');
    });

    it('should throw error if certificate loading fails', () => {
      const config: MTLSConfig = {
        certPath: '/nonexistent/cert.pem',
        keyPath: '/path/to/key.pem',
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => createMTLSAgent(config)).toThrow(
        'Failed to load mTLS certificate',
      );
    });
  });

  describe('validateMTLSConfig', () => {
    it('should validate correct config', () => {
      const config: MTLSConfig = {
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/key.pem',
      };

      expect(() => validateMTLSConfig(config)).not.toThrow();
    });

    it('should throw error if certPath is missing', () => {
      const config = {
        keyPath: '/path/to/key.pem',
      } as MTLSConfig;

      expect(() => validateMTLSConfig(config)).toThrow(
        'certificate path (certPath) is required',
      );
    });

    it('should throw error if certPath is empty', () => {
      const config: MTLSConfig = {
        certPath: '   ',
        keyPath: '/path/to/key.pem',
      };

      expect(() => validateMTLSConfig(config)).toThrow(
        'certificate path (certPath) is required',
      );
    });

    it('should throw error if keyPath is missing', () => {
      const config = {
        certPath: '/path/to/cert.pem',
      } as MTLSConfig;

      expect(() => validateMTLSConfig(config)).toThrow(
        'private key path (keyPath) is required',
      );
    });

    it('should throw error if keyPath is empty', () => {
      const config: MTLSConfig = {
        certPath: '/path/to/cert.pem',
        keyPath: '',
      };

      expect(() => validateMTLSConfig(config)).toThrow(
        'private key path (keyPath) is required',
      );
    });

    it('should warn about relative paths', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      const config: MTLSConfig = {
        certPath: './relative/cert.pem',
        keyPath: './relative/key.pem',
      };

      validateMTLSConfig(config);

      // Should warn about both relative paths
      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });

    it('should not warn about absolute paths', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      const config: MTLSConfig = {
        certPath: '/absolute/path/cert.pem',
        keyPath: '/absolute/path/key.pem',
      };

      validateMTLSConfig(config);

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});
