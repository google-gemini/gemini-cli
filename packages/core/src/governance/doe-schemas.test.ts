/* eslint-disable license-header/header */
/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

import { describe, it, expect } from 'vitest';
import {
  ComputeAllocationRequest,
  DataSovereigntyPolicy,
  GenesisIntegrityProof
} from './doe-schemas';

describe('DOE Governance Schemas (Sovereign Treaties)', () => {

  describe('ComputeAllocationRequest', () => {
    it('should PASS a valid compute request', () => {
      const valid = {
        job_type: 'SIMULATION',
        node_count: 64,
        wall_time_hours: 12,
        justification: 'This is a simulation of the Sovereign Wave Doctrine for critical infrastructure verification purposes and meets all criteria.',
        telemetry_hook: 'https://audit.doe.gov/v1/trace'
      };
      expect(ComputeAllocationRequest.safeParse(valid).success).toBe(true);
    });

    it('should FAIL if node count exceeds 128 (Drift Prevention)', () => {
      const invalid = {
        job_type: 'TRAINING',
        node_count: 200, // Violation
        wall_time_hours: 12,
        justification: 'Valid justification string that is long enough to pass.',
        telemetry_hook: 'https://audit.doe.gov/v1/trace'
      };
      const result = ComputeAllocationRequest.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Max node limit exceeded');
      }
    });

    it('should FAIL if telemetry hook is not sovereign (Invalid Endpoint)', () => {
        const invalid = {
          job_type: 'AUDIT',
          node_count: 10,
          wall_time_hours: 1,
          justification: 'Valid justification string that is long enough to pass.',
          telemetry_hook: 'https://api.openai.com/v1/trace' // Violation
        };
        const result = ComputeAllocationRequest.safeParse(invalid);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('Invalid telemetry endpoint');
        }
      });
  });

  describe('DataSovereigntyPolicy', () => {
    it('should FAIL if PII is detected (Input Sanitization)', () => {
      const invalid = {
        dataset_id: '123e4567-e89b-12d3-a456-426614174000',
        classification: 'SECRET',
        input_sanitization: {
          contains_pii: true, // Violation
          contains_export_controlled_tech: false
        },
        allowed_egress: ['192.168.1.1'],
        on_violation: 'TERMINATE_CONTAINER_IMMEDIATELY'
      };
      const result = DataSovereigntyPolicy.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('PII Violation: Action Aborted');
      }
    });
  });

  describe('GenesisIntegrityProof', () => {
      it('should FAIL if timestamp is in the future (Temporal Drift)', () => {
          const invalid = {
              tas_dna_hash: 'a'.repeat(128),
              timestamp: Date.now() + 1000000, // Future
              previous_action_hash: 'b'.repeat(64),
              runtime_status: 'NOMINAL'
          };
          const result = GenesisIntegrityProof.safeParse(invalid);
          expect(result.success).toBe(false);
          if (!result.success) {
              expect(result.error.issues[0].message).toContain('Temporal Drift Detected');
          }
      });
  });

});
