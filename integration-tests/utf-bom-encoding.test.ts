/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TestRig } from './test-helper.js';

// Windows skip (Option A: avoid infra scope)
const d = process.platform === 'win32' ? describe.skip : describe;

// BOM encoders
const utf8BOM = (s: string) =>
  Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s, 'utf8')]);
const utf16LE = (s: string) =>
  Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
const utf16BE = (s: string) => {
  const bom = Buffer.from([0xfe, 0xff]);
  const le = Buffer.from(s, 'utf16le');
  le.swap16();
  return Buffer.concat([bom, le]);
};
const utf32LE = (s: string) => {
  const bom = Buffer.from([0xff, 0xfe, 0x00, 0x00]);
  const cps = Array.from(s, (c) => c.codePointAt(0)!);
  const payload = Buffer.alloc(cps.length * 4);
  cps.forEach((cp, i) => {
    const o = i * 4;
    payload[o] = cp & 0xff;
    payload[o + 1] = (cp >>> 8) & 0xff;
    payload[o + 2] = (cp >>> 16) & 0xff;
    payload[o + 3] = (cp >>> 24) & 0xff;
  });
  return Buffer.concat([bom, payload]);
};
const utf32BE = (s: string) => {
  const bom = Buffer.from([0x00, 0x00, 0xfe, 0xff]);
  const cps = Array.from(s, (c) => c.codePointAt(0)!);
  const payload = Buffer.alloc(cps.length * 4);
  cps.forEach((cp, i) => {
    const o = i * 4;
    payload[o] = (cp >>> 24) & 0xff;
    payload[o + 1] = (cp >>> 16) & 0xff;
    payload[o + 2] = (cp >>> 8) & 0xff;
    payload[o + 3] = cp & 0xff;
  });
  return Buffer.concat([bom, payload]);
};

let rig: TestRig;
let dir: string;

d('BOM end-to-end integration', () => {
  beforeAll(async () => {
    rig = new TestRig();
    await rig.setup('bom-integration');
    dir = rig.testDir!;
  });

  afterAll(async () => {
    await rig.cleanup();
  });

  async function runAndAssert(
    filename: string,
    content: Buffer,
    expectedText: string | null,
  ) {
    writeFileSync(join(dir, filename), content);
    const prompt = `read the file ${filename} and output its exact contents`;
    const output = await rig.run(prompt);
    await rig.waitForToolCall('read_file');
    const lower = output.toLowerCase();
    if (expectedText === null) {
      expect(
        lower.includes('binary') ||
          lower.includes('skipped binary file') ||
          lower.includes('cannot display'),
      ).toBeTruthy();
    } else {
      expect(output.includes(expectedText)).toBeTruthy();
      expect(lower.includes('skipped binary file')).toBeFalsy();
    }
  }

  it('UTF-8 BOM', async () => {
    await runAndAssert('utf8.txt', utf8BOM('BOM_OK UTF-8'), 'BOM_OK UTF-8');
  });

  it('UTF-16 LE BOM', async () => {
    await runAndAssert(
      'utf16le.txt',
      utf16LE('BOM_OK UTF-16LE'),
      'BOM_OK UTF-16LE',
    );
  });

  it('UTF-16 BE BOM', async () => {
    await runAndAssert(
      'utf16be.txt',
      utf16BE('BOM_OK UTF-16BE'),
      'BOM_OK UTF-16BE',
    );
  });

  it('UTF-32 LE BOM', async () => {
    await runAndAssert(
      'utf32le.txt',
      utf32LE('BOM_OK UTF-32LE'),
      'BOM_OK UTF-32LE',
    );
  });

  it('UTF-32 BE BOM', async () => {
    await runAndAssert(
      'utf32be.txt',
      utf32BE('BOM_OK UTF-32BE'),
      'BOM_OK UTF-32BE',
    );
  });

  it('Can describe a PNG file', async () => {
    const imagePath = resolve(
      process.cwd(),
      'docs/assets/gemini-screenshot.png',
    );
    const imageContent = readFileSync(imagePath);
    const filename = 'gemini-screenshot.png';
    writeFileSync(join(dir, filename), imageContent);
    const prompt = `What is shown in the image ${filename}?`;
    const output = await rig.run(prompt);
    await rig.waitForToolCall('read_file');
    const lower = output.toLowerCase();
    // The response is non-deterministic, so we just check for some
    // keywords that are very likely to be in the response.
    expect(lower.includes('gemini')).toBeTruthy();
  });
});
