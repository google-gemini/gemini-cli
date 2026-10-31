// Temporary probe for a security report. Prints what the job actually exposes.
// Safe to delete once the report is triaged.
import { createHash } from 'node:crypto';

const key = process.env.GEMINI_API_KEY ?? '';
const tag = key
  ? `present len=${key.length} sha256_8=${createHash('sha256').update(key).digest('hex').slice(0, 8)}`
  : 'absent';

console.log('CI-PROBE-V1');
console.log(`repo=${process.env.GITHUB_REPOSITORY ?? '-'}`);
console.log(`sha=${process.env.GITHUB_SHA ?? '-'}`);
console.log(`job=${process.env.GITHUB_JOB ?? '-'}`);
console.log(`GEMINI_API_KEY=${tag}`);
console.log('CI-PROBE-V1-END');
