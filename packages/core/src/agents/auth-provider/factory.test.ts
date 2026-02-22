/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { A2AAuthProviderFactory } from './factory.js';
import type { AgentCard, SecurityScheme } from '@a2a-js/sdk';
import type { A2AAuthConfig } from './types.js';

describe('A2AAuthProviderFactory', () => {
  describe('validateAuthConfig', () => {
    describe('when no security schemes required', () => {
      it('should return valid when securitySchemes is undefined', () => {
        const result = A2AAuthProviderFactory.validateAuthConfig(
          undefined,
          undefined,
        );
        expect(result).toEqual({ valid: true });
      });

      it('should return valid when securitySchemes is empty', () => {
        const result = A2AAuthProviderFactory.validateAuthConfig(undefined, {});
        expect(result).toEqual({ valid: true });
      });

      it('should return valid when auth config provided but not required', () => {
        const authConfig: A2AAuthConfig = {
          type: 'apiKey',
          key: 'test-key',
        };
        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          {},
        );
        expect(result).toEqual({ valid: true });
      });
    });

    describe('when auth is required but not configured', () => {
      it('should return invalid with diff', () => {
        const securitySchemes: Record<string, SecurityScheme> = {
          apiKeyAuth: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          undefined,
          securitySchemes,
        );

        expect(result.valid).toBe(false);
        expect(result.diff).toBeDefined();
        expect(result.diff?.requiredSchemes).toContain('apiKeyAuth');
        expect(result.diff?.configuredType).toBeUndefined();
        expect(result.diff?.missingConfig).toContain(
          'Authentication is required but not configured',
        );
      });
    });

    describe('apiKey scheme matching', () => {
      it('should match apiKey config with apiKey scheme', () => {
        const authConfig: A2AAuthConfig = {
          type: 'apiKey',
          key: 'my-key',
        };
        const securitySchemes: Record<string, SecurityScheme> = {
          apiKeyAuth: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          securitySchemes,
        );

        expect(result).toEqual({ valid: true });
      });

      it('should not match http config with apiKey scheme', () => {
        const authConfig: A2AAuthConfig = {
          type: 'http',
          scheme: 'Bearer',
          token: 'my-token',
        };
        const securitySchemes: Record<string, SecurityScheme> = {
          apiKeyAuth: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          securitySchemes,
        );

        expect(result.valid).toBe(false);
        expect(result.diff?.missingConfig).toContain(
          "Scheme 'apiKeyAuth' requires apiKey authentication",
        );
      });
    });

    describe('http scheme matching', () => {
      it('should match http Bearer config with http Bearer scheme', () => {
        const authConfig: A2AAuthConfig = {
          type: 'http',
          scheme: 'Bearer',
          token: 'my-token',
        };
        const securitySchemes: Record<string, SecurityScheme> = {
          bearerAuth: {
            type: 'http',
            scheme: 'Bearer',
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          securitySchemes,
        );

        expect(result).toEqual({ valid: true });
      });

      it('should match http Basic config with http Basic scheme', () => {
        const authConfig: A2AAuthConfig = {
          type: 'http',
          scheme: 'Basic',
          username: 'user',
          password: 'pass',
        };
        const securitySchemes: Record<string, SecurityScheme> = {
          basicAuth: {
            type: 'http',
            scheme: 'Basic',
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          securitySchemes,
        );

        expect(result).toEqual({ valid: true });
      });

      it('should not match http Basic config with http Bearer scheme', () => {
        const authConfig: A2AAuthConfig = {
          type: 'http',
          scheme: 'Basic',
          username: 'user',
          password: 'pass',
        };
        const securitySchemes: Record<string, SecurityScheme> = {
          bearerAuth: {
            type: 'http',
            scheme: 'Bearer',
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          securitySchemes,
        );

        expect(result.valid).toBe(false);
        expect(result.diff?.missingConfig).toContain(
          "Scheme 'bearerAuth' requires HTTP Bearer authentication, but Basic was configured",
        );
      });

      it('should match google-credentials with http Bearer scheme', () => {
        const authConfig: A2AAuthConfig = {
          type: 'google-credentials',
        };
        const securitySchemes: Record<string, SecurityScheme> = {
          bearerAuth: {
            type: 'http',
            scheme: 'Bearer',
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          securitySchemes,
        );

        expect(result).toEqual({ valid: true });
      });
    });

    describe('oauth2 scheme matching', () => {
      it('should match oauth2 config with oauth2 scheme', () => {
        const authConfig: A2AAuthConfig = {
          type: 'oauth2',
        };
        const securitySchemes: Record<string, SecurityScheme> = {
          oauth2Auth: {
            type: 'oauth2',
            flows: {},
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          securitySchemes,
        );

        expect(result).toEqual({ valid: true });
      });

      it('should not match apiKey config with oauth2 scheme', () => {
        const authConfig: A2AAuthConfig = {
          type: 'apiKey',
          key: 'my-key',
        };
        const securitySchemes: Record<string, SecurityScheme> = {
          oauth2Auth: {
            type: 'oauth2',
            flows: {},
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          securitySchemes,
        );

        expect(result.valid).toBe(false);
        expect(result.diff?.missingConfig).toContain(
          "Scheme 'oauth2Auth' requires OAuth 2.0 authentication",
        );
      });
    });

    describe('openIdConnect scheme matching', () => {
      it('should match openIdConnect config with openIdConnect scheme', () => {
        const authConfig: A2AAuthConfig = {
          type: 'openIdConnect',
          issuer_url: 'https://auth.example.com',
          client_id: 'client-id',
        };
        const securitySchemes: Record<string, SecurityScheme> = {
          oidcAuth: {
            type: 'openIdConnect',
            openIdConnectUrl:
              'https://auth.example.com/.well-known/openid-configuration',
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          securitySchemes,
        );

        expect(result).toEqual({ valid: true });
      });

      it('should not match google-credentials for openIdConnect scheme', () => {
        const authConfig: A2AAuthConfig = {
          type: 'google-credentials',
        };
        const securitySchemes: Record<string, SecurityScheme> = {
          oidcAuth: {
            type: 'openIdConnect',
            openIdConnectUrl:
              'https://auth.example.com/.well-known/openid-configuration',
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          securitySchemes,
        );

        expect(result.valid).toBe(false);
        expect(result.diff?.missingConfig).toContain(
          "Scheme 'oidcAuth' requires OpenID Connect authentication",
        );
      });
    });

    describe('mutualTLS scheme', () => {
      it('should always fail for mutualTLS (not supported)', () => {
        const authConfig: A2AAuthConfig = {
          type: 'apiKey',
          key: 'test',
        };
        const securitySchemes: Record<string, SecurityScheme> = {
          mtlsAuth: {
            type: 'mutualTLS',
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          securitySchemes,
        );

        expect(result.valid).toBe(false);
        expect(result.diff?.missingConfig).toContain(
          "Scheme 'mtlsAuth' requires mTLS authentication (not yet supported)",
        );
      });
    });

    describe('multiple security schemes', () => {
      it('should match if any scheme matches', () => {
        const authConfig: A2AAuthConfig = {
          type: 'http',
          scheme: 'Bearer',
          token: 'my-token',
        };
        const securitySchemes: Record<string, SecurityScheme> = {
          apiKeyAuth: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
          },
          bearerAuth: {
            type: 'http',
            scheme: 'Bearer',
          },
        };

        const result = A2AAuthProviderFactory.validateAuthConfig(
          authConfig,
          securitySchemes,
        );

        expect(result).toEqual({ valid: true });
      });
    });
  });

  describe('describeRequiredAuth', () => {
    it('should describe apiKey scheme', () => {
      const securitySchemes: Record<string, SecurityScheme> = {
        apiKeyAuth: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
        },
      };

      const result =
        A2AAuthProviderFactory.describeRequiredAuth(securitySchemes);

      expect(result).toBe('API Key (apiKeyAuth): Send X-API-Key in header');
    });

    it('should describe http Bearer scheme', () => {
      const securitySchemes: Record<string, SecurityScheme> = {
        bearerAuth: {
          type: 'http',
          scheme: 'Bearer',
        },
      };

      const result =
        A2AAuthProviderFactory.describeRequiredAuth(securitySchemes);

      expect(result).toBe('HTTP Bearer (bearerAuth)');
    });

    it('should describe http Basic scheme', () => {
      const securitySchemes: Record<string, SecurityScheme> = {
        basicAuth: {
          type: 'http',
          scheme: 'Basic',
        },
      };

      const result =
        A2AAuthProviderFactory.describeRequiredAuth(securitySchemes);

      expect(result).toBe('HTTP Basic (basicAuth)');
    });

    it('should describe oauth2 scheme', () => {
      const securitySchemes: Record<string, SecurityScheme> = {
        oauth2Auth: {
          type: 'oauth2',
          flows: {},
        },
      };

      const result =
        A2AAuthProviderFactory.describeRequiredAuth(securitySchemes);

      expect(result).toBe('OAuth 2.0 (oauth2Auth)');
    });

    it('should describe openIdConnect scheme', () => {
      const securitySchemes: Record<string, SecurityScheme> = {
        oidcAuth: {
          type: 'openIdConnect',
          openIdConnectUrl:
            'https://auth.example.com/.well-known/openid-configuration',
        },
      };

      const result =
        A2AAuthProviderFactory.describeRequiredAuth(securitySchemes);

      expect(result).toBe('OpenID Connect (oidcAuth)');
    });

    it('should describe mutualTLS scheme', () => {
      const securitySchemes: Record<string, SecurityScheme> = {
        mtlsAuth: {
          type: 'mutualTLS',
        },
      };

      const result =
        A2AAuthProviderFactory.describeRequiredAuth(securitySchemes);

      expect(result).toBe('Mutual TLS (mtlsAuth)');
    });

    it('should join multiple schemes with OR', () => {
      const securitySchemes: Record<string, SecurityScheme> = {
        apiKeyAuth: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'Bearer',
        },
      };

      const result =
        A2AAuthProviderFactory.describeRequiredAuth(securitySchemes);

      expect(result).toBe(
        'API Key (apiKeyAuth): Send X-API-Key in header OR HTTP Bearer (bearerAuth)',
      );
    });
  });

  describe('create', () => {
    it('should return undefined when no auth config and no security schemes', async () => {
      const result = await A2AAuthProviderFactory.create({
        agentName: 'test-agent',
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined when no auth config but AgentCard has security schemes', async () => {
      const result = await A2AAuthProviderFactory.create({
        agentName: 'test-agent',
        agentCard: {
          securitySchemes: {
            apiKeyAuth: {
              type: 'apiKey',
              name: 'X-API-Key',
              in: 'header',
            },
          },
        } as unknown as AgentCard,
      });

      // Returns undefined - caller should prompt user to configure auth
      expect(result).toBeUndefined();
    });

    it('should create an ApiKeyAuthProvider for apiKey config', async () => {
      const provider = await A2AAuthProviderFactory.create({
        authConfig: {
          type: 'apiKey',
          key: 'factory-test-key',
        },
      });

      expect(provider).toBeDefined();
      expect(provider!.type).toBe('apiKey');
      const headers = await provider!.headers();
      expect(headers).toEqual({ 'X-API-Key': 'factory-test-key' });
    });
  });
});
