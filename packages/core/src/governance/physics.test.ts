/* eslint-disable license-header/header */
/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

import { describe, it, expect } from 'vitest';
import { validateTransition, Proof } from './physics';

describe('TAS Echosystem Physics', () => {
  const baseProof: Proof = {
    lineageId: 'test-dna',
    kappa: 1.0,
    timestamp: Date.now(),
    witnesses: ['test-witness']
  };

  it('should ADMIT transition when Psi > 1.0 (Low Drift)', () => {
    // Psi = 1.0 * 1.618 * (1 / 0.1) = 16.18 > 1.0
    const admitted = validateTransition(baseProof, 0.1);
    expect(admitted).toBe(true);
  });

  it('should QUENCH transition when Psi <= 1.0 (High Drift)', () => {
    // Psi = 1.0 * 1.618 * (1 / 2.0) = 0.809 <= 1.0
    const admitted = validateTransition(baseProof, 2.0);
    expect(admitted).toBe(false);
  });

  it('should ADMIT transition with High Kappa despite Moderate Drift', () => {
    // Psi = 2.0 * 1.618 * (1 / 1.5) = 2.15 > 1.0
    const strongProof = { ...baseProof, kappa: 2.0 };
    const admitted = validateTransition(strongProof, 1.5);
    expect(admitted).toBe(true);
  });
});
