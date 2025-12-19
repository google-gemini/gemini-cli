/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  ALWAYS_ALLOWED_ENVIRONMENT_VARIABLES,
  NEVER_ALLOWED_ENVIRONMENT_VARIABLES,
  NEVER_ALLOWED_NAME_PATTERNS,
  NEVER_ALLOWED_VALUE_PATTERNS,
  sanitizeEnvironment,
} from './environmentSanitization.js';

describe('sanitizeEnvironment', () => {
  it('should allow safe, common environment variables', () => {
    const env = {
      PATH: '/usr/bin',
      HOME: '/home/user',
      USER: 'user',
      SystemRoot: 'C:\\Windows',
      LANG: 'en_US.UTF-8',
    };
    const sanitized = sanitizeEnvironment(env);
    expect(sanitized).toEqual(env);
  });

  it('should allow variables prefixed with GEMINI_CLI_', () => {
    const env = {
      GEMINI_CLI_FOO: 'bar',
      GEMINI_CLI_BAZ: 'qux',
    };
    const sanitized = sanitizeEnvironment(env);
    expect(sanitized).toEqual(env);
  });

  it('should redact variables with sensitive names from the denylist', () => {
    const env = {
      CLIENT_ID: 'sensitive-id',
      DB_URI: 'sensitive-uri',
      DATABASE_URL: 'sensitive-url',
      SAFE_VAR: 'is-safe',
    };
    const sanitized = sanitizeEnvironment(env);
    expect(sanitized).toEqual({
      SAFE_VAR: 'is-safe',
    });
  });

  it('should redact variables with names matching all sensitive patterns (case-insensitive)', () => {
    const env = {
      // Patterns
      MY_API_TOKEN: 'token-value',
      AppSecret: 'secret-value',
      db_password: 'password-value',
      ORA_PASSWD: 'password-value',
      ANOTHER_KEY: 'key-value',
      some_auth_var: 'auth-value',
      USER_CREDENTIAL: 'cred-value',
      AWS_CREDS: 'creds-value',
      PRIVATE_STUFF: 'private-value',
      SSL_CERT: 'cert-value',
      // Safe variable
      USEFUL_INFO: 'is-ok',
    };
    const sanitized = sanitizeEnvironment(env);
    expect(sanitized).toEqual({
      USEFUL_INFO: 'is-ok',
    });
  });

  it('should redact variables with values matching all private key patterns', () => {
    const env = {
      RSA_KEY: '-----BEGIN RSA PRIVATE KEY-----...',
      OPENSSH_KEY: '-----BEGIN OPENSSH PRIVATE KEY-----...',
      EC_KEY: '-----BEGIN EC PRIVATE KEY-----...',
      PGP_KEY: '-----BEGIN PGP PRIVATE KEY-----...',
      CERTIFICATE: '-----BEGIN CERTIFICATE-----...',
      SAFE_VAR: 'is-safe',
    };
    const sanitized = sanitizeEnvironment(env);
    expect(sanitized).toEqual({
      SAFE_VAR: 'is-safe',
    });
  });

  it('should redact variables with values matching all token and credential patterns', () => {
    const env = {
      // GitHub
      GITHUB_TOKEN_GHP: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      GITHUB_TOKEN_GHO: 'gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      GITHUB_TOKEN_GHU: 'ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      GITHUB_TOKEN_GHS: 'ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      GITHUB_TOKEN_GHR: 'ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      GITHUB_PAT: 'github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      // Google
      GOOGLE_KEY: 'AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      // AWS
      AWS_KEY: 'AKIAxxxxxxxxxxxxxxxx',
      // JWT
      JWT_TOKEN: 'eyJhbGciOiJIUzI1NiJ9.e30.ZRrHA157xAA_7962-a_3rA',
      // Stripe
      STRIPE_SK_LIVE: 'sk_live_xxxxxxxxxxxxxxxxxxxxxxxx',
      STRIPE_RK_LIVE: 'rk_live_xxxxxxxxxxxxxxxxxxxxxxxx',
      STRIPE_SK_TEST: 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxx',
      STRIPE_RK_TEST: 'rk_test_xxxxxxxxxxxxxxxxxxxxxxxx',
      // Slack
      SLACK_XOXB: 'xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxx',
      SLACK_XOXA: 'xoxa-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxx',
      SLACK_XOXP: 'xoxp-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxx',
      SLACK_XOXB_2: 'xoxr-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxx',
      // URL Credentials
      CREDS_IN_HTTPS_URL: 'https://user:password@example.com',
      CREDS_IN_HTTP_URL: 'http://user:password@example.com',
      CREDS_IN_FTP_URL: 'ftp://user:password@example.com',
      CREDS_IN_SMTP_URL: 'smtp://user:password@example.com',
      // Safe variable
      SAFE_VAR: 'is-safe',
    };
    const sanitized = sanitizeEnvironment(env);
    expect(sanitized).toEqual({
      SAFE_VAR: 'is-safe',
    });
  });

  it('should not redact variables that look similar to sensitive patterns', () => {
    const env = {
      // Not a credential in URL
      SAFE_URL: 'https://example.com/foo/bar',
      // Not a real JWT
      NOT_A_JWT: 'this.is.not.a.jwt',
      // Too short to be a token
      ALMOST_A_TOKEN: 'ghp_12345',
      // Contains a sensitive word, but in a safe context in the value
      PUBLIC_KEY_INFO: 'This value describes a public key',
      // Variable names that could be false positives
      KEYNOTE_SPEAKER: 'Dr. Jane Goodall',
      CERTIFIED_DIVER: 'true',
      AUTHENTICATION_FLOW: 'oauth',
      PRIVATE_JET_OWNER: 'false',
    };
    const sanitized = sanitizeEnvironment(env);
    expect(sanitized).toEqual({
      SAFE_URL: 'https://example.com/foo/bar',
      NOT_A_JWT: 'this.is.not.a.jwt',
    });
  });

  it('should not redact variables with undefined or empty values if name is safe', () => {
    const env: NodeJS.ProcessEnv = {
      EMPTY_VAR: '',
      UNDEFINED_VAR: undefined,
      ANOTHER_SAFE_VAR: 'value',
    };
    const sanitized = sanitizeEnvironment(env);
    expect(sanitized).toEqual({
      EMPTY_VAR: '',
      ANOTHER_SAFE_VAR: 'value',
    });
  });

  it('should allow variables that do not match any redaction rules', () => {
    const env = {
      NODE_ENV: 'development',
      APP_VERSION: '1.0.0',
    };
    const sanitized = sanitizeEnvironment(env);
    expect(sanitized).toEqual(env);
  });

  it('should handle an empty environment', () => {
    const env = {};
    const sanitized = sanitizeEnvironment(env);
    expect(sanitized).toEqual({});
  });

  it('should handle a mixed environment with allowed and redacted variables', () => {
    const env = {
      // Allowed
      PATH: '/usr/bin',
      HOME: '/home/user',
      GEMINI_CLI_VERSION: '1.2.3',
      NODE_ENV: 'production',
      // Redacted by name
      API_KEY: 'should-be-redacted',
      MY_SECRET: 'super-secret',
      // Redacted by value
      GH_TOKEN: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      JWT: 'eyJhbGciOiJIUzI1NiJ9.e30.ZRrHA157xAA_7962-a_3rA',
      // Allowed by name but redacted by value
      RANDOM_VAR: '-----BEGIN CERTIFICATE-----...',
    };
    const sanitized = sanitizeEnvironment(env);
    expect(sanitized).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/user',
      GEMINI_CLI_VERSION: '1.2.3',
      NODE_ENV: 'production',
    });
  });

  it('should ensure all names in the sets are capitalized', () => {
    for (const name of ALWAYS_ALLOWED_ENVIRONMENT_VARIABLES) {
      expect(name).toBe(name.toUpperCase());
    }
    for (const name of NEVER_ALLOWED_ENVIRONMENT_VARIABLES) {
      expect(name).toBe(name.toUpperCase());
    }
  });

  it('should ensure all of the regex in the patterns lists are case insensitive', () => {
    for (const pattern of NEVER_ALLOWED_NAME_PATTERNS) {
      expect(pattern.flags).toContain('i');
    }
    for (const pattern of NEVER_ALLOWED_VALUE_PATTERNS) {
      expect(pattern.flags).toContain('i');
    }
  });
});
