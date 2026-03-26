/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Finds all report.json files recursively in a directory.
 */
export function findReports(dir) {
  const reports = [];
  if (!fs.existsSync(dir)) return reports;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      reports.push(...findReports(fullPath));
    } else if (file === 'report.json') {
      reports.push(fullPath);
    }
  }
  return reports;
}

/**
 * Extracts the model name from the artifact path.
 */
export function getModelFromPath(reportPath) {
  const parts = reportPath.split(path.sep);
  // Look for the directory that follows the 'eval-logs-' pattern
  const artifactDir = parts.find((p) => p.startsWith('eval-logs-'));
  if (!artifactDir) return 'unknown';

  const match = artifactDir.match(/^eval-logs-(.+)-(\d+)$/);
  return match ? match[1] : 'unknown';
}

/**
 * Escapes special characters in a string for use in a regular expression.
 */
export function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
