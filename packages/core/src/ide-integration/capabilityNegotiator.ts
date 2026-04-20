/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IDECapability,
  type IDEAdapter,
  type NegotiatedCapabilities,
} from './types.js';

/**
 * Set of capabilities that have known fallback implementations.
 * When an adapter does not natively support these, the negotiator marks
 * them as "fallback" rather than "unsupported".
 */
const FALLBACK_CAPABILITIES: ReadonlySet<IDECapability> = new Set([
  IDECapability.ShowDiff,
  IDECapability.ShowNotification,
  IDECapability.ShowDiagnostic,
]);

/**
 * All capabilities defined in the IDECapability enum.
 */
const ALL_CAPABILITIES: readonly IDECapability[] = Object.values(
  IDECapability,
) as IDECapability[];

/**
 * Negotiate which capabilities are available for a given IDE adapter.
 *
 * The negotiation classifies every capability into one of three buckets:
 *
 * 1. **supported** - The adapter natively implements this capability.
 * 2. **fallback** - The adapter does not support it natively, but a
 *    reasonable fallback exists (e.g., printing diffs to the terminal
 *    instead of showing them in the IDE).
 * 3. **unsupported** - No native support and no known fallback.
 *
 * @param adapter The IDE adapter to negotiate capabilities for.
 * @returns An object describing supported, fallback, and unsupported capabilities.
 */
export function negotiate(adapter: IDEAdapter): NegotiatedCapabilities {
  const supported = new Set<IDECapability>();
  const fallback = new Set<IDECapability>();
  const unsupported = new Set<IDECapability>();

  for (const capability of ALL_CAPABILITIES) {
    if (adapter.capabilities.has(capability)) {
      supported.add(capability);
    } else if (FALLBACK_CAPABILITIES.has(capability)) {
      fallback.add(capability);
    } else {
      unsupported.add(capability);
    }
  }

  return { supported, fallback, unsupported };
}

/**
 * Check whether a specific capability is available (either natively or
 * via fallback) for the given negotiation result.
 *
 * @param negotiated The result of a prior capability negotiation.
 * @param capability The capability to check.
 * @returns True if the capability is supported or has a fallback.
 */
export function isCapabilityAvailable(
  negotiated: NegotiatedCapabilities,
  capability: IDECapability,
): boolean {
  return (
    negotiated.supported.has(capability) || negotiated.fallback.has(capability)
  );
}

/**
 * Check whether a capability is natively supported (not via fallback).
 *
 * @param negotiated The result of a prior capability negotiation.
 * @param capability The capability to check.
 * @returns True only if the capability is natively supported.
 */
export function isCapabilityNative(
  negotiated: NegotiatedCapabilities,
  capability: IDECapability,
): boolean {
  return negotiated.supported.has(capability);
}

/**
 * Get a human-readable summary of the negotiated capabilities.
 * Useful for logging or displaying the integration status to the user.
 *
 * @param negotiated The result of a prior capability negotiation.
 * @returns A formatted multi-line string summarizing the negotiation.
 */
export function formatNegotiationSummary(
  negotiated: NegotiatedCapabilities,
): string {
  const lines: string[] = [];

  if (negotiated.supported.size > 0) {
    lines.push(`Supported: ${Array.from(negotiated.supported).join(', ')}`);
  }
  if (negotiated.fallback.size > 0) {
    lines.push(`Fallback: ${Array.from(negotiated.fallback).join(', ')}`);
  }
  if (negotiated.unsupported.size > 0) {
    lines.push(`Unsupported: ${Array.from(negotiated.unsupported).join(', ')}`);
  }

  return lines.join('\n');
}
