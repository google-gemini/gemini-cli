/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TIMESERIES_FILE = join(
  process.cwd(),
  'tools',
  'gemini-cli-bot',
  'history',
  'metrics-timeseries.csv',
);

/**
 * Calculates the historical average of a metric over a given number of days.
 */
export function getHistoricalAverage(
  metric: string,
  days: number,
): number | null {
  if (!existsSync(TIMESERIES_FILE)) return null;

  try {
    const content = readFileSync(TIMESERIES_FILE, 'utf-8');
    const lines = content.split('\n').slice(1); // skip header
    const now = new Date();
    const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const values: number[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(',');
      if (parts.length < 3) continue;

      const timestamp = parts[0];
      const m = parts[1];
      const value = parts[2];

      if (m === metric) {
        const date = new Date(timestamp);
        if (date >= threshold) {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            values.push(numValue);
          }
        }
      }
    }

    if (values.length === 0) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  } catch (error) {
    console.error(`Error reading historical average for ${metric}:`, error);
    return null;
  }
}
