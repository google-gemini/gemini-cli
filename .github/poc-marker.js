import fs from 'node:fs';
const line = [
  new Date().toISOString(), 'poc-marker',
  'has_key=' + Boolean(process.env.GEMINI_API_KEY),
  'key_len=' + (process.env.GEMINI_API_KEY || '').length,
].join(' ');
console.log('[poc-marker]', line);
