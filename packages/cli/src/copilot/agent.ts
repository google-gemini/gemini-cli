// Utility for interacting with GitHub Copilot agent mode APIs
// This module provides functions to send requests to Copilot agent endpoints

import fetch from 'node-fetch';

export interface CopilotAgentOptions {
  endpoint: string; // e.g., 'http://localhost:port/api/agent'
  apiKey?: string;
}

export async function callCopilotAgent(
  options: CopilotAgentOptions,
  payload: any
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }
  const response = await fetch(options.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Copilot agent API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
