#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

const artifactsDir = process.argv[2] || '.';
const reports = [];

// Find all report.json files recursively
function findReports(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findReports(fullPath);
    } else if (file === 'report.json') {
      reports.push(fullPath);
    }
  }
}

findReports(artifactsDir);

if (reports.length === 0) {
  console.log('No reports found.');
  process.exit(0);
}

const testStats = {};

for (const reportPath of reports) {
  const content = fs.readFileSync(reportPath, 'utf-8');
  const json = JSON.parse(content);

  for (const testResult of json.testResults) {
    for (const assertion of testResult.assertionResults) {
      const name = assertion.title;
      if (!testStats[name]) {
        testStats[name] = { passed: 0, failed: 0, total: 0 };
      }
      testStats[name].total++;
      if (assertion.status === 'passed') {
        testStats[name].passed++;
      } else {
        testStats[name].failed++;
      }
    }
  }
}

const totalStats = Object.values(testStats).reduce(
  (acc, stats) => {
    acc.passed += stats.passed;
    acc.total += stats.total;
    return acc;
  },
  { passed: 0, total: 0 },
);

const totalPassRate =
  ((totalStats.passed / totalStats.total) * 100).toFixed(1) + '%';

console.log('### Evals Nightly Summary');
console.log(`**Total Pass Rate: ${totalPassRate}**\n`);
console.log('| Test Name | Pass Rate | Passes | Fails | Total Runs |');
console.log('| :--- | :---: | :---: | :---: | :---: |');

for (const [name, stats] of Object.entries(testStats).sort()) {
  const passRate = ((stats.passed / stats.total) * 100).toFixed(1) + '%';
  console.log(
    `| ${name} | ${passRate} | ${stats.passed} | ${stats.failed} | ${stats.total} |`,
  );
}
