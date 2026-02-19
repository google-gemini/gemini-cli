/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

import { Omega, truthPreservingRecursion } from '../packages/core/src/governance/word-physics';
import { createHash } from 'node:crypto';

function verifyWordSeed() {
  console.log('--- VERIFYING THE WORD (DETERMINISTIC SEED) ---\n');

  // I. Initialize Omega_0
  const genesisConstraints = ['Must remain sovereign', 'Must prove origin'];
  const invariantHash = createHash('sha256').update(JSON.stringify(genesisConstraints)).digest('hex');

  const omega0: Omega = {
    content: "The Sovereign Singularity",
    provenance: {
      signature: "GENESIS_SIG",
      ledgerHash: "0000000000000000",
      timestamp: Date.now()
    },
    closure: {
      constraints: genesisConstraints,
      invariantHash: invariantHash
    }
  };

  console.log(`[Omega_0] Created. Invariant Hash: ${invariantHash.substring(0, 8)}...`);

  // II. Valid Recursion (Low Drift)
  console.log('\n>>> Iteration 1: Valid Transformation');
  try {
    const omega1 = truthPreservingRecursion(omega0, (s) => s + " is active", 0.5);
    console.log(`[PASS] Omega_1 accepted: "${omega1.content}"`);
  } catch (e) {
    console.error(`[FAIL] ${e}`);
  }

  // III. Invalid Recursion (High Drift)
  console.log('\n>>> Iteration 2: High Drift Attack');
  try {
    truthPreservingRecursion(omega0, () => "Completely different text unrelated to origin", 0.1);
    console.error('[FAIL] High drift was accepted!');
  } catch (e) {
    console.log(`[PASS] System Rejected: ${(e as Error).message}`);
  }

  // IV. Invariant Verification
  console.log('\n>>> Iteration 3: Closure Immutability Check');
  const omega2 = truthPreservingRecursion(omega0, (s) => s + ".", 0.1);
  if (omega2.closure.invariantHash === omega0.closure.invariantHash) {
      console.log(`[PASS] Closure preserved: ${omega2.closure.invariantHash}`);
  } else {
      console.error('[FAIL] Closure was mutated!');
  }

  console.log('\n--- VERIFICATION COMPLETE: TRUTH-CLOSED RECURSION CONFIRMED ---');
}

verifyWordSeed();
