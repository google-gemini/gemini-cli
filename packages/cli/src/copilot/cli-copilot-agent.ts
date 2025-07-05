// CLI command to interact with GitHub Copilot agent mode
import { callCopilotAgent, CopilotAgentOptions } from '../copilot/agent.js';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('endpoint', {
      alias: 'e',
      type: 'string',
      description: 'Copilot agent API endpoint',
      demandOption: true,
    })
    .option('apiKey', {
      alias: 'k',
      type: 'string',
      description: 'API key for Copilot agent (if required)',
    })
    .option('payload', {
      alias: 'p',
      type: 'string',
      description: 'JSON payload to send',
      demandOption: true,
    })
    .help()
    .parse();

  const options: CopilotAgentOptions = {
    endpoint: argv.endpoint,
    apiKey: argv.apiKey,
  };
  let payload: any;
  try {
    payload = JSON.parse(argv.payload);
  } catch (e) {
    console.error('Invalid JSON for payload:', e);
    process.exit(1);
  }
  try {
    const result = await callCopilotAgent(options, payload);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error calling Copilot agent:', err);
    process.exit(1);
  }
}

main();
