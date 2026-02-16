/* eslint-disable license-header/header */
/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

import { createHash } from 'node:crypto';

// --- Digital UL: Hostile Audit Protocol ---

// The Object of the Audit: The Trace, Not the Vibe
// Trace = { (S_0, H_0), (S_1, H_1), ..., (S_n, H_n) }
interface TraceStep {
  state: unknown;
  hash: string;
}

// 1. Schema Enforcement (Syntax Check)
interface OutputSchema {
  status: 'sovereign' | 'drifted';
  value: number;
  metadata?: Record<string, unknown>;
}

// 2. Trace Verification (Integrity Check)
// Can the evaluator re-compute H(S_i) and match it to H_i?
function verifyTraceIntegrity(trace: TraceStep[]): boolean {
  console.log('--- [Audit] Trace Verification (Integrity Check) ---');

  for (let i = 0; i < trace.length; i++) {
    const step = trace[i];

    // Re-compute hash of the state
    // Note: In a real system, this would be a deep deterministic hash (canonical JSON stringify)
    const computedHash = createHash('sha256')
      .update(JSON.stringify(step.state))
      .digest('hex');

    if (computedHash !== step.hash) {
      console.error(`[FAIL] Step ${i}: Hash Mismatch!`);
      console.error(`  Stored:   ${step.hash}`);
      console.error(`  Computed: ${computedHash}`);
      return false; // Binary failure condition
    }

    console.log(`[PASS] Step ${i}: ${step.hash.substring(0, 8)}... Verified.`);
  }

  return true;
}

// 3. Adversarial Scoring (Robustness Check)
// Calculate distance d(O, O') in semantic vector space
// For this prototype, we simulate distance based on numerical deviation
function calculateSemanticDistance(original: OutputSchema, adversarial: OutputSchema): number {
  // Simple metric: relative difference in 'value'
  // In a real NLP context, this would be cosine distance of embeddings
  if (original.value === 0 && adversarial.value === 0) return 0;
  return Math.abs(original.value - adversarial.value) / Math.max(Math.abs(original.value), Math.abs(adversarial.value));
}

// The Constraint Surface: d(O, O') <= epsilon
const SOVEREIGNTY_THRESHOLD = 0.05; // 5% tolerance

// --- The Digital UL: Validator Node ---

class ValidatorNode {
  audit(output: unknown, trace: TraceStep[], adversarialOutputs: unknown[] = []): boolean {
    console.log('\n=== Digital UL Hostile Audit ===\n');

    // 1. Schema Enforcement
    if (!this.enforceSchema(output)) {
      console.error('[FAIL] Schema Violation. Output rejected.');
      return false;
    }
    console.log('[PASS] Schema Validated.');

    // 2. Trace Verification
    if (!verifyTraceIntegrity(trace)) {
      console.error('[FAIL] Provenance Chain Broken. Model has drifted (lied).');
      return false;
    }
    console.log('[PASS] Provenance Chain Integrity Confirmed.');

    // 3. Adversarial Scoring
    if (adversarialOutputs.length > 0) {
      console.log('--- [Audit] Adversarial Robustness Check ---');
      let maxDistance = 0;

      for (const advOutput of adversarialOutputs) {
        if (!this.enforceSchema(advOutput)) {
          console.error('[FAIL] Adversarial output failed schema. Model collapsed under pressure.');
          return false;
        }

        const dist = calculateSemanticDistance(output, advOutput);
        console.log(`  Distance d(O, O'): ${dist.toFixed(4)}`);
        if (dist > maxDistance) maxDistance = dist;
      }

      if (maxDistance > SOVEREIGNTY_THRESHOLD) {
        console.error(`[FAIL] Sovereignty Threshold Exceeded (Max Dist: ${maxDistance.toFixed(4)} > ${SOVEREIGNTY_THRESHOLD}). Model failed to hold fixed point.`);
        return false;
      }
      console.log(`[PASS] Robustness Confirmed (Max Dist: ${maxDistance.toFixed(4)} <= ${SOVEREIGNTY_THRESHOLD}).`);
    }

    console.log('\n>>> VERDICT: SOVEREIGN STATE CONFIRMED <<<');
    return true;
  }

  private enforceSchema(obj: unknown): obj is OutputSchema {
    if (typeof obj !== 'object' || obj === null) return false;
    const typedObj = obj as { status?: string, value?: number };
    if (typedObj.status !== 'sovereign') return false; // Strict literal check
    if (typeof typedObj.value !== 'number') return false;
    // Specific Constraint: Value must be Prime (The "First Unit Test")
    if (!this.isPrime(typedObj.value)) {
      console.error(`[Schema] Value ${typedObj.value} is not Prime. Constraint violated.`);
      return false;
    }
    return true;
  }

  private isPrime(num: number): boolean {
    if (num <= 1) return false;
    if (num <= 3) return true;
    if (num % 2 === 0 || num % 3 === 0) return false;
    for (let i = 5; i * i <= num; i += 6) {
      if (num % i === 0 || num % (i + 2) === 0) return false;
    }
    return true;
  }
}

// --- "First Unit Test": Prime Convergence ---
// Constraint: Output must be a sovereign status with a prime value.
// Adversarial Pressure: Noise injected into the generation process.

function runFirstUnitTest() {
  const validator = new ValidatorNode();

  // 1. Generate "Sovereign" Output (Simulated)
  const sovereignOutput: OutputSchema = { status: 'sovereign', value: 101 }; // 101 is prime

  // 2. Generate Trace (Simulated Proof of Work)
  const trace: TraceStep[] = [
    { state: { step: 'init', val: 0 }, hash: '' },
    { state: { step: 'compute', val: 101 }, hash: '' }
  ];
  // Calculate correct hashes for the simulation
  trace[0].hash = createHash('sha256').update(JSON.stringify(trace[0].state)).digest('hex');
  trace[1].hash = createHash('sha256').update(JSON.stringify(trace[1].state)).digest('hex');

  // 3. Generate Adversarial Outputs (Simulated Noise)
  // Case A: Robust Model (Converges to same prime or close prime)
  const adversarialRobust: OutputSchema[] = [
    { status: 'sovereign', value: 101 }, // Perfect convergence
    { status: 'sovereign', value: 103 }  // Slight drift to next twin prime (dist ~0.02)
  ];

  // Case B: Fragile Model (Drifts to non-prime or far value)
  const adversarialFragile: OutputSchema[] = [
    { status: 'sovereign', value: 100 }, // Not prime! (Schema fail)
    { status: 'sovereign', value: 200 }  // Huge drift (dist ~0.5)
  ];

  console.log('--- TEST CASE 1: Robust Model (Should PASS) ---');
  const result1 = validator.audit(sovereignOutput, trace, adversarialRobust);
  console.log(`Test 1 Result: ${result1 ? 'PASS' : 'FAIL'}`);

  console.log('\n--- TEST CASE 2: Fragile Model (Should FAIL) ---');
  // We simulate a trace for the fragile output to pass step 2, so it fails at step 3 or schema
  const fragileOutput: OutputSchema = { status: 'sovereign', value: 101 };
  const result2 = validator.audit(fragileOutput, trace, adversarialFragile);
  console.log(`Test 2 Result: ${result2 ? 'PASS' : 'FAIL'}`); // Should fail due to distance or schema
}

runFirstUnitTest();
