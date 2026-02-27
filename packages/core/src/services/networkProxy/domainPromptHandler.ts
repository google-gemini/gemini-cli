/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NetworkProxyManager } from './networkProxyManager.js';
import { DomainFilterAction } from './types.js';

/**
 * Strips ANSI escape sequences and control characters from a hostname
 * to prevent terminal injection attacks.
 */
export function sanitizeHostname(hostname: string): string {
  // Remove ANSI escape sequences
  // eslint-disable-next-line no-control-regex
  return hostname.replace(/[\x00-\x1f\x7f-\x9f]|\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Prompt callback for asking the user whether to allow or deny a domain.
 * Implementation is UI-agnostic (CLI readline, Ink, VS Code, etc.).
 */
export type DomainPromptCallback = (
  hostname: string,
) => Promise<DomainFilterAction>;

/**
 * Connects a NetworkProxyManager's domainCheck events to a user-facing prompt.
 *
 * When the proxy encounters a domain that resolves to PROMPT (no matching rule
 * and defaultAction is 'prompt'), it emits a 'domainCheck' event. This handler
 * intercepts that event, calls the provided prompt callback to get the user's
 * decision, and relays the answer back to the proxy.
 */
export class DomainPromptHandler {
  private attached = false;
  private listener: ((hostname: string, respond: (action: DomainFilterAction) => void) => void) | null = null;

  constructor(
    private readonly manager: NetworkProxyManager,
    private readonly promptCallback: DomainPromptCallback,
  ) {}

  /**
   * Starts listening for domain check events.
   */
  attach(): void {
    if (this.attached) {
      return;
    }

    this.listener = (hostname: string, respond: (action: DomainFilterAction) => void) => {
      this.promptCallback(hostname)
        .then((decision) => {
          respond(decision);
        })
        .catch(() => {
          // On prompt failure, deny for safety
          respond(DomainFilterAction.DENY);
        });
    };

    this.manager.on('domainCheck', this.listener);
    this.attached = true;
  }

  /**
   * Stops listening for domain check events.
   */
  detach(): void {
    if (!this.attached || !this.listener) {
      return;
    }
    this.manager.removeListener('domainCheck', this.listener);
    this.listener = null;
    this.attached = false;
  }

  isAttached(): boolean {
    return this.attached;
  }
}

/**
 * Creates a simple console-based domain prompt callback.
 *
 * This is used as a fallback when no UI-specific prompt is available.
 * For interactive CLI sessions, the CLI layer should provide a richer
 * prompt using Ink or readline.
 */
export function createConsoleDomainPrompt(): DomainPromptCallback {
  return async (hostname: string): Promise<DomainFilterAction> => {
    // In non-interactive mode or when no proper prompt is available,
    // deny unknown domains by default for security.
    const readline = await import('node:readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });

    const safe = sanitizeHostname(hostname);
    return new Promise<DomainFilterAction>((resolve) => {
      rl.question(
        `\nNetwork proxy: "${safe}" wants to connect. Allow? [Y/n] `,
        (answer) => {
          rl.close();
          const normalized = answer.trim().toLowerCase();
          if (normalized === 'y' || normalized === '') {
            resolve(DomainFilterAction.ALLOW);
          } else {
            resolve(DomainFilterAction.DENY);
          }
        },
      );
    });
  };
}
