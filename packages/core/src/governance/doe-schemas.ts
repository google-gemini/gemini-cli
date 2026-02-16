/* eslint-disable license-header/header */
/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

import { z } from 'zod';

// 1. The Identity Layer (The Passport)
// The "STAC Doctrine" encoded into an Enum
export const SecurityClearanceLevel = z.enum([
  'UNCLASSIFIED',
  'CUI',           // Controlled Unclassified Information
  'SECRET',
  'TOP_SECRET',
  'GENESIS_CORE'   // The Sovereign Control Plane
]);

export const GenesisIntegrityProof = z.object({
  // The Immutable Identity: Matches package-lock.json SHA-512
  tas_dna_hash: z.string().length(128).regex(/^[a-f0-9]+$/, "Invalid SHA-512 Hash"),

  // The Temporal Invariant: Prevention of replay attacks
  timestamp: z.number().refine((val) => val <= Date.now() + 1000, "Temporal Drift Detected: Timestamp in future"),

  // The Audit Trace: Link to the previous action (Blockchain-style linkage)
  previous_action_hash: z.string().length(64),

  // The Agent's "Self-Reported" state (must match external observation)
  runtime_status: z.enum(['NOMINAL', 'RECOVERY', 'LOCKED']),
});

// 2. The Energy Layer (The Hamiltonian)
export const ComputeAllocationRequest = z.object({
  // The "Steering Wheel" constraints
  job_type: z.enum(['INFERENCE', 'TRAINING', 'SIMULATION', 'AUDIT']),

  // Strict bounds on energy consumption
  node_count: z.number().min(1).max(128, "Constraint Violation: Max node limit exceeded for this clearance"),
  wall_time_hours: z.number().max(24, "Temporal limit exceeded. Checksum failed."),

  // The "Why": Veritable Agency requires justification
  justification: z.string().min(50, "Entropy too high: Insufficient justification for compute spend."),

  // Simulation of "Sovereign SOC" monitoring
  telemetry_hook: z.string().url().startsWith("https://audit.doe.gov", "Invalid telemetry endpoint"),
});

// 3. The Information Layer (The Airlock)
export const DataSovereigntyPolicy = z.object({
  dataset_id: z.string().uuid(),

  // The "Digital UL" Classification
  classification: SecurityClearanceLevel,

  // The Filter: Input must be low-entropy (Structured)
  input_sanitization: z.object({
    contains_pii: z.boolean().refine(val => !val, "PII Violation: Action Aborted"),
    contains_export_controlled_tech: z.boolean(),
  }),

  // The Output Constraint: Where can the results go?
  allowed_egress: z.array(z.string().ip()).nonempty("Data Blackhole: No egress path defined."),

  // The Kill Switch: If verification fails, destroy the container
  on_violation: z.literal('TERMINATE_CONTAINER_IMMEDIATELY'),
});

// 4. The Sovereign Job Manifest (The Contract)
export const SovereignJobManifest = z.object({
  proof: GenesisIntegrityProof,
  resources: ComputeAllocationRequest,
  data_policy: DataSovereigntyPolicy,

  // The Payload: The actual code to run (The "Hand")
  // Must be wrapped in a specific signature, no raw bash scripts.
  payload_signature: z.string().regex(/^TAS_SIG_v1_[a-zA-Z0-9]+$/, "Unsigned Payload Rejected"),
});

export type SovereignJob = z.infer<typeof SovereignJobManifest>;
