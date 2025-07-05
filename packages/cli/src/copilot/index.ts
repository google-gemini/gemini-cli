import { callCopilotAgent, CopilotAgentOptions } from './agent.js';

export async function sendToCopilotAgent(
  endpoint: string,
  payload: any,
  apiKey?: string
): Promise<any> {
  const options: CopilotAgentOptions = { endpoint, apiKey };
  return callCopilotAgent(options, payload);
}
