import fs from 'fs';

const path = 'evals/logs/report.json';

if (!fs.existsSync(path)) {
  console.log('No report.json found');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path, 'utf-8'));

console.log('\n=== EVALUATION SUMMARY ===');

console.log(`Suites: ${data.numTotalTestSuites}`);
console.log(`Passed: ${data.numPassedTestSuites}`);
console.log(`Failed: ${data.numFailedTestSuites}`);

console.log(`\nTests: ${data.numTotalTests}`);
console.log(`Passed: ${data.numPassedTests}`);
console.log(`Failed: ${data.numFailedTests}`);
console.log(`Skipped: ${data.numPendingTests}`);

// Smart error categorization
function categorizeError(msg: string): string {
  if (msg.includes('GEMINI_API_KEY')) return 'Missing GEMINI_API_KEY';
  if (msg.includes('EPERM')) return 'File Permission Error (EPERM)';
  if (msg.includes('metricReader')) return 'Deprecated Config (metricReader)';
  if (msg.includes('Process exited')) return 'Process Exit Error';
  return 'Other Errors';
}

const errorMap: Record<string, number> = {};

data.testResults.forEach((suite: any) => {
  suite.assertionResults.forEach((test: any) => {
    if (test.failureMessages?.length > 0) {
      const fullMsg = test.failureMessages[0];
      const category = categorizeError(fullMsg);

      errorMap[category] = (errorMap[category] || 0) + 1;
    }
  });
});

console.log('\n=== FAILURE ANALYSIS ===');

Object.entries(errorMap)
  .sort((a, b) => b[1] - a[1])
  .forEach(([err, count]) => {
    console.log(`${count} → ${err}`);
  });

// Helpful hints
if (errorMap['Missing GEMINI_API_KEY']) {
  console.log('\n⚠️  Tip: Set GEMINI_API_KEY to fix many failing tests');
}

if (errorMap['File Permission Error (EPERM)']) {
  console.log(
    '⚠️  Tip: Check file permissions or try running terminal as admin',
  );
}

if (errorMap['Deprecated Config (metricReader)']) {
  console.log("⚠️  Tip: Update config from 'metricReader' → 'metricReaders'");
}

console.log('\n=========================\n');
