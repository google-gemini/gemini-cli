/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  TestRig,
  setupTestRig,
  cleanupTestRig,
  type LocalTestContext,
} from './test-helper.js';

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

describe('BOM end-to-end integraion', () => {
  beforeEach<LocalTestContext>(async (context) => {
    await setupTestRig(context);
    await context.rig.setup('bom-integration', {
      settings: { tools: { core: ['read_file'] } },
    });
  });

  afterEach<LocalTestContext>(cleanupTestRig);

  async function runAndAssert(
    rig: TestRig,
    filename: string,
    content: Buffer,
    expectedText: string | null,
  ) {
    writeFileSync(join(rig.testDir!, filename), content);
    const prompt = `read the file ${filename} and output its exact contents`;
    const output = await rig.run({ args: prompt });
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

  it<LocalTestContext>('UTF-8 BOM', async ({ rig }) => {
    await runAndAssert(
      rig,
      'utf8.txt',
      utf8BOM('BOM_OK UTF-8'),
      'BOM_OK UTF-8',
    );
  });

  it<LocalTestContext>('UTF-16 LE BOM', async ({ rig }) => {
    await runAndAssert(
      rig,
      'utf16le.txt',
      utf16LE('BOM_OK UTF-16LE'),
      'BOM_OK UTF-16LE',
    );
  });

  it<LocalTestContext>('UTF-16 BE BOM', async ({ rig }) => {
    await runAndAssert(
      rig,
      'utf16be.txt',
      utf16BE('BOM_OK UTF-16BE'),
      'BOM_OK UTF-16BE',
    );
  });

  it<LocalTestContext>('UTF-32 LE BOM', async ({ rig }) => {
    await runAndAssert(
      rig,
      'utf32le.txt',
      utf32LE('BOM_OK UTF-32LE'),
      'BOM_OK UTF-32LE',
    );
  });

  it<LocalTestContext>('UTF-32 BE BOM', async ({ rig }) => {
    await runAndAssert(
      rig,
      'utf32be.txt',
      utf32BE('BOM_OK UTF-32BE'),
      'BOM_OK UTF-32BE',
    );
  });

  it<LocalTestContext>('Can describe a PNG file', async ({ rig }) => {
    const imagePath = resolve(
      process.cwd(),
      'docs/assets/gemini-screenshot.png',
    );
    const imageContent = readFileSync(imagePath);
    const filename = 'gemini-screenshot.png';
    writeFileSync(join(rig.testDir!, filename), imageContent);
    const prompt = `What is shown in the image ${filename}?`;
    const output = await rig.run({ args: prompt });
    await rig.waitForToolCall('read_file');
    const lower = output.toLowerCase();
    // The response is non-deterministic, so we just check for some
    // keywords that are very likely to be in the response.
    expect(lower.includes('gemini')).toBeTruthy();
  });
});
