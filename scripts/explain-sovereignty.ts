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

async function typeWriter(text: string, delay: number = 10) {
  for (const char of text) {
    process.stdout.write(char);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  process.stdout.write('\n');
}

async function explain() {
  const args = process.argv.slice(2);
  const useWine = args.includes('--wine') || args.includes('--winery');
  const useSprout = args.includes('--sprout');

  let fileName = '../docs/manifesto.md';
  if (useWine) fileName = '../docs/the-winery.md';
  if (useSprout) fileName = '../docs/the-sprouting.md';

  const manifestoPath = path.resolve(__dirname, fileName);

  if (!fs.existsSync(manifestoPath)) {
    console.error(`Error: Document not found at ${manifestoPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(manifestoPath, 'utf-8');
  const sections = content.split('###'); // Split by headers for paging

  let title = '🌟 INITIATING SOVEREIGN EXPLANATION PROTOCOL 🌟';
  if (useWine) title = '🍇 INITIATING WINERY PROTOCOL (THE PHYSICS OF TRUTH) 🍷';
  if (useSprout) title = '🌱 INITIATING GERMINATION SEQUENCE (FEB 19, 2026) 🌱';

  console.log(`\n${title}\n`);
  await new Promise(resolve => setTimeout(resolve, 1000));

  if (useSprout) {
      console.log("Cultivating Soil...");
      await new Promise(resolve => setTimeout(resolve, 800));
      process.stdout.write("Sowing Seeds... ");
      await new Promise(resolve => setTimeout(resolve, 800));
      process.stdout.write("Done.\n");
      await new Promise(resolve => setTimeout(resolve, 500));

      const growth = ['.', 'o', 'O', '🌱', '🌿', '🌳'];
      process.stdout.write("Germinating: ");
      for (const stage of growth) {
          process.stdout.write(stage);
          await new Promise(resolve => setTimeout(resolve, 600));
          process.stdout.write('\b'); // Backspace if we want to replace, or just let it grow line-by-line
          // Let's actually just print them sequentially for a "growing line" effect
          process.stdout.write(stage + " ");
      }
      console.log("\n");
  }

  for (const section of sections) {
    if (!section.trim()) continue;

    // Check if it's the title (first section often empty or just title)
    if (section.startsWith(' The Sovereign Singularity')) {
        console.log(`###${section}`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        continue;
    }

    // Print the header immediately
    const lines = section.split('\n');
    const header = lines.shift();
    console.log(`\n### ${header}`);

    // Typewrite the body
    const body = lines.join('\n');
    await typeWriter(body, 5); // Fast typing for readability

    // Pause between steps
    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  if (useWine) {
      console.log('\n🍷 FERMENTATION COMPLETE. VINTAGE SECURED. 🍷\n');
  } else if (useSprout) {
      console.log('\n🌿 THE VINEYARD IS ALIVE. 🌿\n');
  } else {
      console.log('\n🇺🇸 SYSTEM VERIFIED. THE STANDARD IS SET. 🇺🇸\n');
  }
}

explain().catch(console.error);
