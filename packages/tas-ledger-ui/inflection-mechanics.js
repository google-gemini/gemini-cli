/* eslint-disable license-header/header */
/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

/* inflection-mechanics.js
   TAS “physics”: Eigenresonance + Complexity -> recursive truth amplification
*/

// A “Statement” is the semantic unit being admitted through the glass layer.
export class Statement {
  constructor({ id, claim, inputs = [], constraints = [], expected_effect = "" }) {
    this.id = id;
    this.claim = claim;
    this.inputs = inputs;
    this.constraints = constraints;
    this.expected_effect = expected_effect;
  }
}

// Metrics measured at an inflection point (node).
export class InflectionPointMetrics {
  constructor({ eigenresonance, complexity, drift = 0.0 }) {
    this.eigenresonance = eigenresonance; // [0..1]
    this.complexity = complexity;         // [0..1] (higher = harder / noisier)
    this.drift = drift;                   // [0..1]
  }
}

/**
 * recursiveTruthAmplification(metrics, cfg)
 * Produces:
 *  - resonance: final resonance after recursion
 *  - ready: whether node is eligible for execution
 *  - steps: trace of the recursion (for audit visualization)
 */
export function recursiveTruthAmplification(metrics, cfg = {}) {
  const {
    iterations = 7,
    passThreshold = 0.95,   // “Iff gate”: execute iff resonance >= threshold
    complexityCeiling = 0.65,
    driftCeiling = 0.35,

    // dynamics coefficients
    alpha = 0.62, // resonance gain from eigenresonance
    beta = 0.48,  // resonance loss from complexity
    gamma = 0.35, // resonance loss from drift

    // soft clamp for stability
    clampMin = 0.0,
    clampMax = 1.0
  } = cfg;

  const clamp = (x) => Math.max(clampMin, Math.min(clampMax, x));

  const steps = [];
  // Start state: eigenresonance is your “potential”
  let r = clamp(metrics.eigenresonance);

  for (let i = 0; i < iterations; i++) {
    // “Physics”: resonance changes by gain minus friction/dissipation
    const gain = alpha * metrics.eigenresonance * (1 - r);
    const loss = beta * metrics.complexity * r + gamma * metrics.drift * r;

    // recursion update
    r = clamp(r + gain - loss);

    steps.push({
      i,
      resonance: r,
      gain,
      loss,
      eigenresonance: metrics.eigenresonance,
      complexity: metrics.complexity,
      drift: metrics.drift
    });
  }

  const bounded = metrics.complexity <= complexityCeiling && metrics.drift <= driftCeiling;
  const ready = bounded && r >= passThreshold;

  return { resonance: r, ready, bounded, steps, cfgUsed: {
    iterations, passThreshold, complexityCeiling, driftCeiling, alpha, beta, gamma
  }};
}
