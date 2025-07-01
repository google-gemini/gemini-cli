/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import Papa from 'papaparse';
import xml2js from 'xml2js';

export async function readFile(filePath: string, lines: number | null = null) {
  const resolvedPath = path.resolve(filePath);
  const stats = await fs.stat(resolvedPath);
  if (stats.size > 1_000_000) throw new Error('File exceeds 1 MB limit.');

  const ext = path.extname(filePath).toLowerCase();
  if (['.csv'].includes(ext)) {
    const data = await fs.readFile(resolvedPath, 'utf-8');
    return Papa.parse(data, { header: true }).data;
  } else if (['.json'].includes(ext)) {
    return JSON.parse(await fs.readFile(resolvedPath, 'utf-8'));
  } else if (['.xml'].includes(ext)) {
    const data = await fs.readFile(resolvedPath, 'utf-8');
    const result = await xml2js.parseStringPromise(data);
    return result;
  } else {
    const data = await fs.readFile(resolvedPath, 'utf-8');
    return lines ? data.split('\n').slice(0, lines).join('\n') : data;
  }
}