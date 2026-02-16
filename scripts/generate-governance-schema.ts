/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import { SovereignToolInvocation } from '../packages/core/src/governance/sovereign-tool-schema';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generate() {
  const schema = zodToJsonSchema(SovereignToolInvocation, 'SovereignToolInvocation');
  const outputPath = path.resolve(__dirname, '../python_runtime/governance.json');

  fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
  console.log(`[TAS] Governance Schema exported to: ${outputPath}`);
}

generate();
