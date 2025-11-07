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
      let asciiArt = '';
      for (let y = 0; y < this.height; y++) {
        let line = '';
        for (let x = 0; x < this.width; x++) {
          const idx = (this.width * y + x) << 2;
          const r = this.data[idx];
          const a = this.data[idx + 3];
          if (a < 128) {
            line += ' ';
          } else if (r < 128) {
            line += '█';
          } else {
            line += '░';
          }
        }
        asciiArt += line.trimEnd() + '\n';
      }
      // Remove the very last newline to avoid an empty extra line if desired,
      // but keeping it might be cleaner for the template literal.
      // Let's keep it simple and just trim the whole thing at the end if needed,
      // but a trailing newline is often good standard practice.
      // Actually, for template literal it's better to NOT have a leading newline
      // if we want exact matching, but for readability:
      /*
        export const FOO = `
        ███
        ███
        `;
      */
      // The above has a leading newline (empty line) and a trailing newline.
      // We should probably trim it when parsing.

      const fileContent = `/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const ${variableName} = \`
${asciiArt}\`;
`;
      fs.writeFileSync(outputFilePath, fileContent);
      console.log(`Exported ${file} to ${outputFilePath}`);
    })
    .on('error', (err) => {
      console.error(`Error processing ${file}:`, err);
    });
});
