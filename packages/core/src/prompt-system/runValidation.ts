/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationSuite } from './ValidationSuite.js';

/**
 * Standalone script to run comprehensive validation of the modular prompt system
 */
async function runValidation() {
  console.log(
    '🚀 Starting comprehensive validation of modular prompt system...\n',
  );

  const validationSuite = new ValidationSuite({
    minOverallScore: 85,
    minTokenReduction: 60,
    maxAssemblyTime: 100,
    requiredModules: ['identity', 'mandates', 'security'],
    maxCriticalIssues: 0,
  });

  try {
    const report = await validationSuite.runCompleteValidation();

    console.log('\n🎯 VALIDATION COMPLETE\n');
    console.log(`Status: ${report.status}`);
    console.log(
      `Production Ready: ${report.productionReady ? '✅ YES' : '❌ NO'}`,
    );
    console.log(`Overall Score: ${report.overallScore.toFixed(1)}/100`);
    console.log(`Critical Issues: ${report.criticalIssues.length}`);
    console.log(`Warnings: ${report.warnings.length}`);

    console.log('\n📊 Category Scores:');
    for (const [category, score] of Object.entries(report.categoryScores)) {
      const status = score >= 90 ? '🟢' : score >= 70 ? '🟡' : '🔴';
      const formattedCategory = category
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase());
      console.log(`  ${status} ${formattedCategory}: ${score.toFixed(1)}`);
    }

    console.log('\n📝 Detailed Report:');
    console.log('='.repeat(80));
    console.log(validationSuite.generateReport(report));

    // Exit with appropriate code
    process.exit(report.productionReady ? 0 : 1);
  } catch (error) {
    console.error('❌ Validation failed with error:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runValidation();
}

export { runValidation };
