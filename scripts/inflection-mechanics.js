/* eslint-disable license-header/header */
/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

import { createHash } from 'node:crypto';

const GOLDEN_RATIO_CONSTANT = '1.618033988749895'; // Used as a deterministic seed

/**
 * Computes a SHA-256 hash of the input string.
 * @param {string} input
 * @returns {string} Hexadecimal hash.
 */
function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Represents a deterministic state in the system.
 */
class State {
  /**
   * @param {number} index - The sequence index.
   * @param {string} parentHash - The hash of the parent state (or 'GENESIS' for index 0).
   * @param {string} bond - The deterministic bond value linking this state to its parent.
   * @param {string} data - The payload data.
   * @param {string} hash - The cryptographic proof of this state's existence.
   */
  constructor(index, parentHash, bond, data, hash) {
    this.index = index;
    this.parentHash = parentHash;
    this.bond = bond;
    this.data = data;
    this.hash = hash;
  }

  toString() {
    return `State[${this.index}] Hash: ${this.hash.substring(0, 8)}... | Parent: ${this.parentHash.substring(0, 8)}... | Bond: ${this.bond.substring(0, 8)}...`;
  }
}

/**
 * Computes the deterministic bond required for a state given its parent's hash.
 * Bond = SHA256(ParentHash + GOLDEN_RATIO_CONSTANT)
 * @param {string} parentHash
 * @returns {string} The bond hash.
 */
function computeBond(parentHash) {
  return sha256(parentHash + GOLDEN_RATIO_CONSTANT);
}

/**
 * Computes the state hash.
 * Hash = SHA256(Index + ParentHash + Bond + Data)
 * @param {number} index
 * @param {string} parentHash
 * @param {string} bond
 * @param {string} data
 * @returns {string} The state hash.
 */
function computeStateHash(index, parentHash, bond, data) {
  return sha256(`${index}:${parentHash}:${bond}:${data}`);
}

/**
 * Creates the Genesis State (Index 0).
 * @param {string} data
 * @returns {State}
 */
function createGenesis(data) {
  const index = 0;
  const parentHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const bond = computeBond(parentHash); // Deterministic even for Genesis
  const hash = computeStateHash(index, parentHash, bond, data);
  return new State(index, parentHash, bond, data, hash);
}

/**
 * Instantiates a new state from a parent state.
 * @param {State} parentState
 * @param {string} data
 * @returns {State}
 */
function instantiateState(parentState, data) {
  const index = parentState.index + 1;
  const parentHash = parentState.hash;
  const bond = computeBond(parentHash); // Bond derived from parent
  const hash = computeStateHash(index, parentHash, bond, data);

  return new State(index, parentHash, bond, data, hash);
}

/**
 * Verifies the existence of a state based on its parent.
 * Existence(state) ⇔ ValidParent(state) ∧ ValidBond(state)
 *
 * @param {State} state
 * @param {State} parent
 * @returns {boolean}
 */
function verifyExistence(state, parent) {
  // 1. ValidParent: State's parent reference matches parent's actual hash
  const isValidParent = state.parentHash === parent.hash;
  if (!isValidParent) {
    console.error(`[Verification Failed] Invalid Parent Reference. Expected: ${parent.hash}, Got: ${state.parentHash}`);
    return false;
  }

  // 2. ValidBond: Bond is deterministically derived from parent
  const expectedBond = computeBond(parent.hash);
  const isValidBond = state.bond === expectedBond;
  if (!isValidBond) {
    console.error(`[Verification Failed] Invalid Bond. Expected: ${expectedBond}, Got: ${state.bond}`);
    return false;
  }

  // 3. Integrity: State hash is valid
  const expectedHash = computeStateHash(state.index, state.parentHash, state.bond, state.data);
  const isIntegrityValid = state.hash === expectedHash;
  if (!isIntegrityValid) {
    console.error(`[Verification Failed] Hash Mismatch. Expected: ${expectedHash}, Got: ${state.hash}`);
    return false;
  }

  return true;
}

/**
 * Demonstrates the strict state machine invariant.
 */
function demonstrateStateMachine() {
  console.log('--- Initiating Deterministic State Machine ---');

  // 1. Instantiate Genesis
  const genesis = createGenesis('Genesis Block');
  console.log(`[Created] ${genesis.toString()}`);

  // 2. Instantiate Chain
  let currentState = genesis;
  const chain = [genesis];

  for (let i = 0; i < 5; i++) {
    const nextState = instantiateState(currentState, `Data Block ${i + 1}`);
    console.log(`[Created] ${nextState.toString()}`);
    chain.push(nextState);
    currentState = nextState;
  }

  console.log('\n--- Verifying Chain Integrity ---');

  // 3. Verify Chain
  let allValid = true;
  for (let i = 1; i < chain.length; i++) {
    const parent = chain[i - 1];
    const child = chain[i];
    const isValid = verifyExistence(child, parent);

    console.log(`State[${child.index}] Verification: ${isValid ? 'VALID' : 'INVALID'}`);
    if (!isValid) allValid = false;
  }

  console.log(`\nSystem Invariant Check: ${allValid ? 'PASSED' : 'FAILED'}`);
}

// Execute
demonstrateStateMachine();
