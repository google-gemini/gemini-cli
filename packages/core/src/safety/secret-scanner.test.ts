/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  scanAndRedact,
  isSensitiveFilename,
} from './secret-scanner.js';

describe('scanAndRedact', () => {
  describe('AWS credentials', () => {
    it('redacts an AWS access key ID', () => {
      const content = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const { matches, sanitized } = scanAndRedact(content);
      expect(matches.some((m) => m.type === 'aws_key_id')).toBe(true);
      expect(sanitized).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(sanitized).toContain('[REDACTED:aws_key_id]');
    });

    it('redacts ASIA prefixed (STS) keys', () => {
      const content = 'KEY=ASIAIOSFODNN7EXAMPLE';
      const { matches } = scanAndRedact(content);
      expect(matches.some((m) => m.type === 'aws_key_id')).toBe(true);
    });
  });

  describe('GitHub tokens', () => {
    it('redacts a GitHub personal access token', () => {
      const token = 'ghp_' + 'a'.repeat(36);
      const { matches, sanitized } = scanAndRedact(`GITHUB_TOKEN=${token}`);
      expect(matches.some((m) => m.type === 'github_token')).toBe(true);
      expect(sanitized).toContain('[REDACTED:github_token]');
    });

    it('redacts a GitHub OAuth token', () => {
      const token = 'gho_' + 'b'.repeat(36);
      const { matches } = scanAndRedact(token);
      expect(matches.some((m) => m.type === 'github_token')).toBe(true);
    });
  });

  describe('Google API keys', () => {
    it('redacts a Google API key', () => {
      const key = 'AIza' + 'x'.repeat(35);
      const { matches, sanitized } = scanAndRedact(`API_KEY=${key}`);
      expect(matches.some((m) => m.type === 'google_api_key')).toBe(true);
      expect(sanitized).toContain('[REDACTED:google_api_key]');
    });
  });

  describe('Slack tokens', () => {
    it('redacts a Slack bot token', () => {
      const { matches } = scanAndRedact('SLACK_TOKEN=xoxb-1234-5678-abcdefg');
      expect(matches.some((m) => m.type === 'slack_token')).toBe(true);
    });
  });

  describe('PEM private keys', () => {
    it('redacts a PEM private key header', () => {
      const { matches, sanitized } = scanAndRedact(
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAA...',
      );
      expect(matches.some((m) => m.type === 'private_key')).toBe(true);
      expect(sanitized).toContain('[REDACTED:private_key]');
    });
  });

  describe('Connection strings', () => {
    it('redacts a postgres connection string with credentials', () => {
      const { matches, sanitized } = scanAndRedact(
        'DATABASE_URL=postgres://admin:s3cr3t@prod.db.internal:5432/app',
      );
      expect(matches.some((m) => m.type === 'connection_string')).toBe(true);
      expect(sanitized).not.toContain('s3cr3t');
    });
  });

  describe('false positive avoidance', () => {
    it('does not flag normal TypeScript code', () => {
      const code = `
        function getApiKey(): string {
          return process.env.API_KEY || '';
        }
        const url = 'https://example.com/api';
        const base64data = btoa('hello world');
      `;
      const { matches } = scanAndRedact(code);
      expect(matches).toHaveLength(0);
    });

    it('does not flag short base64 strings', () => {
      const { matches } = scanAndRedact('const encoded = btoa("hello");');
      expect(matches).toHaveLength(0);
    });
  });
});

describe('isSensitiveFilename', () => {
  it('flags .env files', () => {
    expect(isSensitiveFilename('.env')).toBe(true);
    expect(isSensitiveFilename('.env.local')).toBe(true);
    expect(isSensitiveFilename('production.env')).toBe(true);
  });

  it('flags private key files', () => {
    expect(isSensitiveFilename('id_rsa')).toBe(true);
    expect(isSensitiveFilename('id_ed25519')).toBe(true);
    expect(isSensitiveFilename('server.pem')).toBe(true);
    expect(isSensitiveFilename('cert.key')).toBe(true);
  });

  it('flags terraform credential files', () => {
    expect(isSensitiveFilename('terraform.tfvars')).toBe(true);
    expect(isSensitiveFilename('secrets.tfvars')).toBe(true);
  });

  it('flags files with credential keywords in name', () => {
    expect(isSensitiveFilename('my-secrets.json')).toBe(true);
    expect(isSensitiveFilename('db_credentials.yml')).toBe(true);
    expect(isSensitiveFilename('admin_password.txt')).toBe(true);
  });

  it('does not flag normal source files', () => {
    expect(isSensitiveFilename('index.ts')).toBe(false);
    expect(isSensitiveFilename('README.md')).toBe(false);
    expect(isSensitiveFilename('package.json')).toBe(false);
    expect(isSensitiveFilename('config.ts')).toBe(false);
  });
});
