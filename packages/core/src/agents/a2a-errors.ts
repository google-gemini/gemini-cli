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

  constructor(agentName: string, message: string, userMessage: string) {
    super(message);
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
    const userMessage =
      `Could not find agent "${agentName}": The agent card URL returned 404 Not Found.\n` +
      `  URL: ${agentCardUrl}\n` +
      `  Please verify:\n` +
      `    • The agent_card_url in your agent definition is correct\n` +
      `    • The remote agent server is running and accessible`;
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
    const userMessage =
      `Authentication failed for agent "${agentName}" (HTTP ${statusCode} ${statusText}).\n` +
      `  URL: ${agentCardUrl}\n` +
      `  Please verify:\n` +
      `    • Your agent definition includes the correct "auth" configuration\n` +
      `    • Any API keys or tokens referenced by environment variables are set\n` +
      `    • You have permission to access this agent`;
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
    const missingList = missingFields.map((f) => `    • ${f}`).join('\n');
    const userMessage =
      `Agent "${agentName}" requires authentication that is not configured.\n` +
      `  Required: ${requiredAuth}\n` +
      `  Missing configuration:\n${missingList}\n` +
      `  To fix, add an "auth" section to your agent definition. Example:\n` +
      `    auth:\n` +
      `      type: apiKey\n` +
      `      key: $MY_API_KEY`;
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
    const userMessage =
      `Failed to connect to agent "${agentName}".\n` +
      `  URL: ${agentCardUrl}\n` +
      `  Error: ${causeMessage}\n` +
      `  Please verify:\n` +
      `    • The remote agent server is running and accessible\n` +
      `    • Your network connection is working\n` +
      `    • The agent_card_url in your agent definition is correct`;
    super(agentName, message, userMessage);
    this.name = 'AgentConnectionError';
  }
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
    if (current instanceof Error) {
      parts.push(current.message);
      // Some errors (like Node's AggregateError) may have a `code` property
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const code = (current as unknown as { code?: string }).code;
      if (code) {
        parts.push(code);
      }
      // Also check for a `status` or `statusCode` property (some HTTP libs set these)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const errRecord = current as unknown as {
        status?: number;
        statusCode?: number;
      };
      const status = errRecord.status ?? errRecord.statusCode;
      if (typeof status === 'number') {
        parts.push(String(status));
      }
      current = current.cause;
    } else if (typeof current === 'string') {
      parts.push(current);
      break;
    } else if (typeof current === 'object' && current !== null) {
      // Handle plain objects (non-Error) that may have message/status/cause properties.
      // Some HTTP libraries set cause to a plain object like { message: '...', status: 401 }.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const obj = current as Record<string, unknown>;
      if (typeof obj['message'] === 'string') {
        parts.push(obj['message']);
      }
      if (typeof obj['code'] === 'string') {
        parts.push(obj['code']);
      }
      const status =
        (typeof obj['status'] === 'number' ? obj['status'] : undefined) ??
        (typeof obj['statusCode'] === 'number' ? obj['statusCode'] : undefined);
      if (status !== undefined) {
        parts.push(String(status));
      }
      // Continue walking if this object has a cause property
      if (obj['cause']) {
        current = obj['cause'];
      } else {
        break;
      }
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

  // Check for HTTP status code patterns across the full cause chain.
  if (/\b404\b|not.?found/i.test(fullErrorText)) {
    return new AgentCardNotFoundError(agentName, agentCardUrl);
  }

  if (/\b401\b|unauthorized/i.test(fullErrorText)) {
    return new AgentCardAuthError(agentName, agentCardUrl, 401);
  }

  if (/\b403\b|forbidden/i.test(fullErrorText)) {
    return new AgentCardAuthError(agentName, agentCardUrl, 403);
  }

  // Check for well-known connection error codes in the cause chain.
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT/i.test(fullErrorText)) {
    return new AgentConnectionError(agentName, agentCardUrl, error);
  }

  // Fallback to a generic connection error.
  return new AgentConnectionError(agentName, agentCardUrl, error);
}
