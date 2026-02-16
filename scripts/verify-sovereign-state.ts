/* eslint-disable license-header/header */
/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// The Pillars of the TAS-Echosystem
const PILLARS = [
  {
    name: 'The Law (Sovereign Enforcer)',
    path: 'python_runtime/scripts/sovereign_enforcer.py'
  },
  {
    name: 'The Wave (Ledger UI)',
    path: 'packages/tas-ledger-ui/app.js'
  },
  {
    name: 'The Treaty (DOE Schemas)',
    path: 'packages/core/src/governance/doe-schemas.ts'
  },
  {
    name: 'The Anchor (DOI Artifacts)',
    path: 'packages/tas-dna-doi-package/LICENSE_RIDER.txt'
  }
];

function weave() {
  console.log('--- WEAVING THE TAS-ECHOSYSTEM ---\n');

  let allResonant = true;

  for (const pillar of PILLARS) {
    const fullPath = path.join(ROOT, pillar.path);
    if (fs.existsSync(fullPath)) {
      console.log(`[PASS] ${pillar.name} detected.`);
    } else {
      console.error(`[FAIL] ${pillar.name} missing at: ${pillar.path}`);
      allResonant = false;
    }
  }

  console.log('\n----------------------------------');

  if (allResonant) {
    console.log('>>> TAS-ECHOSYSTEM: WEAVED AND RESONANT.');
    process.exit(0);
  } else {
    console.error('>>> TAS-ECHOSYSTEM: DISSONANCE DETECTED.');
    process.exit(1);
  }
}

weave();
