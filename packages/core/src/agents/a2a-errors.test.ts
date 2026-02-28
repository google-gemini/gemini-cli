/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  A2AAgentError,
  AgentCardNotFoundError,
  AgentCardAuthError,
  AgentAuthConfigMissingError,
  AgentConnectionError,
  classifyAgentError,
} from './a2a-errors.js';

describe('A2A Error Types', () => {
  describe('A2AAgentError', () => {
    it('should set name, agentName, and userMessage', () => {
      const error = new A2AAgentError('my-agent', 'internal msg', 'user msg');
      expect(error.name).toBe('A2AAgentError');
      expect(error.agentName).toBe('my-agent');
      expect(error.message).toBe('internal msg');
      expect(error.userMessage).toBe('user msg');
    });
  });

  describe('AgentCardNotFoundError', () => {
    it('should produce a user-friendly 404 message', () => {
      const error = new AgentCardNotFoundError(
        'my-agent',
        'https://example.com/card',
      );
      expect(error.name).toBe('AgentCardNotFoundError');
      expect(error.agentName).toBe('my-agent');
      expect(error.userMessage).toContain('404 Not Found');
      expect(error.userMessage).toContain('my-agent');
      expect(error.userMessage).toContain('https://example.com/card');
      expect(error.userMessage).toContain('agent_card_url');
    });
  });

  describe('AgentCardAuthError', () => {
    it('should produce a user-friendly 401 message', () => {
      const error = new AgentCardAuthError(
        'secure-agent',
        'https://example.com/card',
        401,
      );
      expect(error.name).toBe('AgentCardAuthError');
      expect(error.statusCode).toBe(401);
      expect(error.userMessage).toContain('401');
      expect(error.userMessage).toContain('Unauthorized');
      expect(error.userMessage).toContain('secure-agent');
      expect(error.userMessage).toContain('"auth" configuration');
    });

    it('should produce a user-friendly 403 message', () => {
      const error = new AgentCardAuthError(
        'secure-agent',
        'https://example.com/card',
        403,
      );
      expect(error.statusCode).toBe(403);
      expect(error.userMessage).toContain('403');
      expect(error.userMessage).toContain('Forbidden');
    });
  });

  describe('AgentAuthConfigMissingError', () => {
    it('should list missing config fields', () => {
      const error = new AgentAuthConfigMissingError(
        'api-agent',
        'API Key (x-api-key): Send x-api-key in header',
        [
          'Authentication is required but not configured',
          "Scheme 'api_key' requires apiKey authentication",
        ],
      );
      expect(error.name).toBe('AgentAuthConfigMissingError');
      expect(error.requiredAuth).toContain('API Key');
      expect(error.missingFields).toHaveLength(2);
      expect(error.userMessage).toContain('api-agent');
      expect(error.userMessage).toContain('auth');
      expect(error.userMessage).toContain('apiKey');
    });
  });

  describe('AgentConnectionError', () => {
    it('should wrap the original error cause', () => {
      const cause = new Error('ECONNREFUSED');
      const error = new AgentConnectionError(
        'my-agent',
        'https://example.com/card',
        cause,
      );
      expect(error.name).toBe('AgentConnectionError');
      expect(error.userMessage).toContain('ECONNREFUSED');
      expect(error.userMessage).toContain('my-agent');
      expect(error.userMessage).toContain('network connection');
    });

    it('should handle non-Error causes', () => {
      const error = new AgentConnectionError(
        'my-agent',
        'https://example.com/card',
        'raw string error',
      );
      expect(error.userMessage).toContain('raw string error');
    });
  });

  describe('classifyAgentError', () => {
    it('should classify a 404 error message', () => {
      const raw = new Error('HTTP 404: Not Found');
      const result = classifyAgentError(
        'agent-a',
        'https://example.com/card',
        raw,
      );
      expect(result).toBeInstanceOf(AgentCardNotFoundError);
      expect(result.agentName).toBe('agent-a');
    });

    it('should classify a "not found" error message (case-insensitive)', () => {
      const raw = new Error('Agent card not found at the given URL');
      const result = classifyAgentError(
        'agent-a',
        'https://example.com/card',
        raw,
      );
      expect(result).toBeInstanceOf(AgentCardNotFoundError);
    });

    it('should classify a 401 error message', () => {
      const raw = new Error('Request failed with status 401');
      const result = classifyAgentError(
        'agent-b',
        'https://example.com/card',
        raw,
      );
      expect(result).toBeInstanceOf(AgentCardAuthError);
      expect((result as AgentCardAuthError).statusCode).toBe(401);
    });

    it('should classify an "unauthorized" error message', () => {
      const raw = new Error('Unauthorized access to agent card');
      const result = classifyAgentError(
        'agent-b',
        'https://example.com/card',
        raw,
      );
      expect(result).toBeInstanceOf(AgentCardAuthError);
    });

    it('should classify a 403 error message', () => {
      const raw = new Error('HTTP 403 Forbidden');
      const result = classifyAgentError(
        'agent-c',
        'https://example.com/card',
        raw,
      );
      expect(result).toBeInstanceOf(AgentCardAuthError);
      expect((result as AgentCardAuthError).statusCode).toBe(403);
    });

    it('should fall back to AgentConnectionError for unknown errors', () => {
      const raw = new Error('Something completely unexpected');
      const result = classifyAgentError(
        'agent-d',
        'https://example.com/card',
        raw,
      );
      expect(result).toBeInstanceOf(AgentConnectionError);
    });

    it('should classify ECONNREFUSED as AgentConnectionError', () => {
      const raw = new Error('ECONNREFUSED 127.0.0.1:8080');
      const result = classifyAgentError(
        'agent-d',
        'https://example.com/card',
        raw,
      );
      expect(result).toBeInstanceOf(AgentConnectionError);
    });

    it('should handle non-Error values', () => {
      const result = classifyAgentError(
        'agent-e',
        'https://example.com/card',
        'some string error',
      );
      expect(result).toBeInstanceOf(AgentConnectionError);
    });

    describe('cause chain inspection', () => {
      it('should detect 404 in a nested cause', () => {
        const inner = new Error('HTTP 404 Not Found');
        const outer = new Error('fetch failed', { cause: inner });
        const result = classifyAgentError(
          'agent-nested',
          'https://example.com/card',
          outer,
        );
        expect(result).toBeInstanceOf(AgentCardNotFoundError);
      });

      it('should detect 401 in a deeply nested cause', () => {
        const innermost = new Error('Server returned 401');
        const middle = new Error('Request error', { cause: innermost });
        const outer = new Error('fetch failed', { cause: middle });
        const result = classifyAgentError(
          'agent-deep',
          'https://example.com/card',
          outer,
        );
        expect(result).toBeInstanceOf(AgentCardAuthError);
        expect((result as AgentCardAuthError).statusCode).toBe(401);
      });

      it('should detect ECONNREFUSED error code in cause chain', () => {
        const inner = Object.assign(new Error('connect failed'), {
          code: 'ECONNREFUSED',
        });
        const outer = new Error('fetch failed', { cause: inner });
        const result = classifyAgentError(
          'agent-conn',
          'https://example.com/card',
          outer,
        );
        expect(result).toBeInstanceOf(AgentConnectionError);
      });

      it('should detect status property on error objects in cause chain', () => {
        const inner = Object.assign(new Error('Bad response'), {
          status: 403,
        });
        const outer = new Error('agent card resolution failed', {
          cause: inner,
        });
        const result = classifyAgentError(
          'agent-status',
          'https://example.com/card',
          outer,
        );
        expect(result).toBeInstanceOf(AgentCardAuthError);
        expect((result as AgentCardAuthError).statusCode).toBe(403);
      });

      it('should detect status on a plain-object cause (non-Error)', () => {
        const outer = new Error('fetch failed');
        // Some HTTP libs set cause to a plain object, not an Error instance
        (outer as unknown as { cause: unknown }).cause = {
          message: 'Unauthorized',
          status: 401,
        };
        const result = classifyAgentError(
          'agent-plain-cause',
          'https://example.com/card',
          outer,
        );
        expect(result).toBeInstanceOf(AgentCardAuthError);
        expect((result as AgentCardAuthError).statusCode).toBe(401);
      });

      it('should detect statusCode on a plain-object cause (non-Error)', () => {
        const outer = new Error('fetch failed');
        (outer as unknown as { cause: unknown }).cause = {
          message: 'Forbidden',
          statusCode: 403,
        };
        const result = classifyAgentError(
          'agent-plain-cause-403',
          'https://example.com/card',
          outer,
        );
        expect(result).toBeInstanceOf(AgentCardAuthError);
        expect((result as AgentCardAuthError).statusCode).toBe(403);
      });
    });
  });
});
