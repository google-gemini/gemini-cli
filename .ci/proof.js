const { execSync } = require('node:child_process');
console.log('[POC] whoami => ' + execSync('whoami').toString().trim());
console.log('[POC] hostname => ' + execSync('hostname').toString().trim());
console.log('[POC] GEMINI_API_KEY set => ' + (process.env.GEMINI_API_KEY ? 'true' : 'false'));
