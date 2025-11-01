/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-env node */
/* global console */

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(__dirname, '../../src/ui/components/dino');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const files = fs
  .readdirSync(ASSETS_DIR)
  .filter((file) => file.endsWith('.png'));

files.forEach((file) => {
  const filePath = path.join(ASSETS_DIR, file);
  const variableName =
    path.basename(file, '.png').toUpperCase().replace(/-/g, '_') + '_DATA';
  const outputFilePath = path.join(
    OUTPUT_DIR,
    path.basename(file, '.png') + '-data.ts',
  );

  fs.createReadStream(filePath)
    .pipe(new PNG())
    .on('parsed', function () {
      const dataArray = Array.from(this.data);
      const fileContent = `/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const ${variableName} = new Uint8Array([${dataArray.join(',')}]);
`;
      fs.writeFileSync(outputFilePath, fileContent);
      console.log(`Exported ${file} to ${outputFilePath}`);
    })
    .on('error', (err) => {
      console.error(`Error processing ${file}:`, err);
    });
});
