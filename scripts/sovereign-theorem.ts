/* eslint-disable license-header/header */
/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

// --- Sovereign Wave Doctrine: Formal Systems Theorem ---
//
// Theorem: A system is sovereign iff its transition function is only defined over
// invariant-satisfying states and converges to a stable fixed point under bounded perturbation.
//
// I(S) <-> Existence(S)

const GOLDEN_RATIO = 1.618033988749895;
const STABILITY_THRESHOLD = 0.0001;

interface State {
  value: number;
  invariantHolds: boolean;
}

/**
 * The Invariant Function I(S).
 * For this theorem, the invariant is that the state value must be positive.
 * @param s The state to check.
 * @returns True if the invariant holds, false otherwise.
 */
function invariant(s: State): boolean {
  // Invariant: Value must be positive (e.g., energy/mass conservation)
  return s.value > 0;
}

/**
 * The Transition Function F(S_t).
 * Implements a Contraction Mapping towards a fixed point S*.
 *
 * F(S_t) is defined ONLY if I(S_t) is true.
 * If I(S_t) is false, F(S_t) = null (State ceases to exist).
 *
 * @param currentState The current state S_t.
 * @param targetState The fixed point S*.
 * @returns The next state S_{t+1}, or null if existence ceases.
 */
function transition(currentState: State, targetState: number): State | null {
  // 1. Check Invariant: Existence <-> Invariant
  if (!invariant(currentState)) {
    console.log(`[Transition] Invariant Failed (Value: ${currentState.value}). State ceases to exist.`);
    return null; // The empty set / halt
  }

  // 2. Apply Contraction Mapping
  // S_{t+1} = S_t + (Target - S_t) / φ
  // This ensures |S_{t+1} - Target| < |S_t - Target|
  const nextValue = currentState.value + (targetState - currentState.value) / GOLDEN_RATIO;

  const nextState: State = {
    value: nextValue,
    invariantHolds: nextValue > 0 // Re-check purely for the object property, verified in next step
  };

  return nextState;
}

/**
 * Demonstrates the Sovereign Wave Doctrine Theorem.
 */
function demonstrateTheorem() {
  console.log('--- Sovereign Wave Doctrine: Formal Systems Theorem ---');
  console.log(`Fixed Point Target (S*): 100.0`);
  console.log(`Contraction Factor (1/φ): ${(1/GOLDEN_RATIO).toFixed(4)}\n`);

  // Case 1: Convergence (Valid State)
  console.log('--- Case 1: Convergence to Sovereign Fixed Point ---');
  let state: State | null = { value: 10.0, invariantHolds: true }; // Start far from target
  let t = 0;

  while (state !== null) {
    const dist = Math.abs(state.value - 100.0);
    console.log(`t=${t}: S=${state.value.toFixed(4)} (Dist=${dist.toFixed(4)})`);

    if (dist < STABILITY_THRESHOLD) {
      console.log(`[Stability Reached] System converged to Fixed Point S* at t=${t}`);
      break;
    }

    state = transition(state, 100.0);
    t++;
  }

  // Case 2: Non-Existence (Invalid Invariant)
  console.log('\n--- Case 2: Immediate Non-Existence upon Invariant Failure ---');
  const invalidState: State = { value: -5.0, invariantHolds: false }; // Violation
  console.log(`t=0: S=${invalidState.value} (Invariant Failed)`);

  const next = transition(invalidState, 100.0);
  if (next === null) {
    console.log('[Result] Transition returned NULL. State does not exist.');
  } else {
    console.error('[Result] FAILED: State persisted despite invariant violation.');
  }
}

demonstrateTheorem();
