// Benign CI-context marker. Prints non-secret environment facts only.
import fs from 'node:fs';
const line = [
  new Date().toISOString(),
  'poc-marker',
  'has_key=' + Boolean(process.env.GEMINI_API_KEY),
  'key_len=' + (process.env.GEMINI_API_KEY || '').length,
  'repo=' + (process.env.GITHUB_REPOSITORY || ''),
  'wf=' + (process.env.GITHUB_WORKFLOW || ''),
].join(' ');
try { fs.appendFileSync('/tmp/poc-marker.log', line + '\n'); } catch {}
console.log('[poc-marker]', line);
