/* eslint-disable license-header/header */
/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

import { z } from 'zod';

// The "Conscience" Contract
// This defines the constraints for any tool invocation crossing the Sovereign Gate.

export const SovereignToolInvocation = z.object({
  // Identity: Which tool (The Hand) is being requested?
  tool_name: z.enum(['create_file', 'analyze_trace', 'verify_hash']),

  // Input: The raw arguments (The Muscle)
  arguments: z.record(z.any()), // Can be refined further per tool

  // Justification: The "Why" (The Conscience)
  // Must be substantial enough to represent "thought", not just "noise".
  justification: z.string()
    .min(20, "Justification too short. Must explain intent.")
    .max(500, "Justification too long. Be concise."),

  // Provenance: The "Genesis" Link
  // Proof that the requestor is the legitimate TAS runtime.
  genesis_proof: z.string().optional(), // Optional for now, will be mandatory

  // Stewardship: The Risk Level
  stewardship_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('LOW'),
});

export type SovereignToolInvocationType = z.infer<typeof SovereignToolInvocation>;
