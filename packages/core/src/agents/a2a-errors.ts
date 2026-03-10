/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Custom error types for A2A remote agent operations.
 * Provides structured, user-friendly error messages for common failure modes
 * during agent card fetching, authentication, and communication.
 */

/**
 * Base class for all A2A agent errors.
 * Provides a `userMessage` field with a human-readable description.
 */
export class A2AAgentError extends Error {
  /** A user-friendly message suitable for display in the CLI. */
  readonly userMessage: string;
  /** The agent name associated with this error. */
  readonly agentName: string;

  constructor(
    agentName: string,
    message: string,
    userMessage: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'A2AAgentError';
    this.agentName = agentName;
    this.userMessage = userMessage;
  }
}

/**
 * Thrown when the agent card URL returns a 404 Not Found response.
 */
export class AgentCardNotFoundError extends A2AAgentError {
  constructor(agentName: string, agentCardUrl: string) {
    const message = `Agent card not found at ${agentCardUrl} (HTTP 404)`;
    const userMessage = `Agent card not found (404) at ${agentCardUrl}. Verify the agent_card_url in your agent definition.`;
    super(agentName, message, userMessage);
    this.name = 'AgentCardNotFoundError';
  }
}

/**
 * Thrown when the agent card URL returns a 401/403 response,
 * indicating an authentication or authorization failure.
 */
export class AgentCardAuthError extends A2AAgentError {
  readonly statusCode: number;

  constructor(agentName: string, agentCardUrl: string, statusCode: 401 | 403) {
    const statusText = statusCode === 401 ? 'Unauthorized' : 'Forbidden';
    const message = `Agent card request returned ${statusCode} ${statusText} for ${agentCardUrl}`;
    const userMessage = `Authentication failed (${statusCode} ${statusText}) at ${agentCardUrl}. Check the "auth" configuration in your agent definition.`;
    super(agentName, message, userMessage);
    this.name = 'AgentCardAuthError';
    this.statusCode = statusCode;
  }
}

/**
 * Thrown when the agent card's security schemes require authentication
 * but the agent definition does not include the necessary auth configuration.
 */
export class AgentAuthConfigMissingError extends A2AAgentError {
  /** Human-readable description of required authentication schemes. */
  readonly requiredAuth: string;
  /** Specific fields or config entries that are missing. */
  readonly missingFields: string[];

  constructor(
    agentName: string,
    requiredAuth: string,
    missingFields: string[],
  ) {
    const message = `Agent "${agentName}" requires authentication but none is configured`;
    const userMessage = `Agent requires ${requiredAuth} but no auth is configured. Missing: ${missingFields.join(', ')}`;
    super(agentName, message, userMessage);
    this.name = 'AgentAuthConfigMissingError';
    this.requiredAuth = requiredAuth;
    this.missingFields = missingFields;
  }
}

/**
 * Thrown when a generic/unexpected network or server error occurs
 * while fetching the agent card or communicating with the remote agent.
 */
export class AgentConnectionError extends A2AAgentError {
  constructor(agentName: string, agentCardUrl: string, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    const message = `Failed to connect to agent "${agentName}" at ${agentCardUrl}: ${causeMessage}`;
    const userMessage = `Connection failed for ${agentCardUrl}: ${causeMessage}`;
    super(agentName, message, userMessage, { cause });
    this.name = 'AgentConnectionError';
  }
}

/** Shape of an error-like object in a cause chain (Error, HTTP response, or plain object). */
interface ErrorLikeObject {
  message?: string;
  code?: string;
  status?: number;
  statusCode?: number;
  cause?: unknown;
}

/** Type guard for objects that may carry error metadata (message, code, status, cause). */
function isErrorLikeObject(val: unknown): val is ErrorLikeObject {
  return typeof val === 'object' && val !== null;
}

/**
 * Collects all error messages from an error's cause chain into a single string
 * for pattern matching. This is necessary because the A2A SDK and Node's fetch
 * often wrap the real error (e.g. HTTP status) deep inside nested causes.
 */
function collectErrorMessages(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  let depth = 0;
  const maxDepth = 10;

  while (current && depth < maxDepth) {
    if (isErrorLikeObject(current)) {
      // Save reference before instanceof narrows the type from ErrorLikeObject to Error.
      const obj = current;

      if (current instanceof Error) {
        parts.push(current.message);
      } else if (typeof obj.message === 'string') {
        parts.push(obj.message);
      }

      if (typeof obj.code === 'string') {
        parts.push(obj.code);
      }

      if (typeof obj.status === 'number') {
        parts.push(String(obj.status));
      } else if (typeof obj.statusCode === 'number') {
        parts.push(String(obj.statusCode));
      }

      current = obj.cause;
    } else if (typeof current === 'string') {
      parts.push(current);
      break;
    } else {
      parts.push(String(current));
      break;
    }
    depth++;
  }

  return parts.join(' ');
}

/**
 * Attempts to classify a raw error from the A2A SDK into a typed A2AAgentError.
 *
 * Inspects the error message and full cause chain for HTTP status codes and
 * well-known patterns to produce a structured, user-friendly error.
 *
 * @param agentName The name of the agent being loaded.
 * @param agentCardUrl The URL of the agent card.
 * @param error The raw error caught during agent loading.
 * @returns A classified A2AAgentError subclass.
 */
export function classifyAgentError(
  agentName: string,
  agentCardUrl: string,
  error: unknown,
): A2AAgentError {
  // Collect messages from the entire cause chain for thorough matching.
  const fullErrorText = collectErrorMessages(error);

  // Check for well-known connection error codes in the cause chain.
  // NOTE: This is checked before the 404 pattern as a defensive measure
  // to prevent DNS errors (ENOTFOUND) from being misclassified as 404s.
  if (
    /\b(ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT)\b/i.test(fullErrorText)
  ) {
    return new AgentConnectionError(agentName, agentCardUrl, error);
  }

  // Check for HTTP status code patterns across the full cause chain.
  if (/\b404\b|\bnot[\s_-]?found\b/i.test(fullErrorText)) {
    return new AgentCardNotFoundError(agentName, agentCardUrl);
  }

  if (/\b401\b|unauthorized/i.test(fullErrorText)) {
    return new AgentCardAuthError(agentName, agentCardUrl, 401);
  }

  if (/\b403\b|forbidden/i.test(fullErrorText)) {
    return new AgentCardAuthError(agentName, agentCardUrl, 403);
  }

  // Fallback to a generic connection error.
  return new AgentConnectionError(agentName, agentCardUrl, error);
}
