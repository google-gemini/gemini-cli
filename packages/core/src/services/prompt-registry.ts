/**
 * @LICENSE
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface McpPromptParameterProperties {
  [name: string]: {
    type: string;
    description: string;
  };
}

export interface McpPrompt {
  name: string;
  description: string;
  template: string;
  parameters: {
    type: 'object';
    properties: McpPromptParameterProperties;
    required: string[];
  };
}

export interface DiscoveredMcpPrompt extends McpPrompt {
  serverName: string;
}

class PromptRegistry {
  private prompts = new Map<string, DiscoveredMcpPrompt>();

  registerPrompt(prompt: DiscoveredMcpPrompt) {
    const key = this.getPromptKey(prompt.serverName, prompt.name);
    if (this.prompts.has(key)) {
      console.warn(`Prompt '${key}' is already registered. Overwriting.`);
    }
    this.prompts.set(key, prompt);
  }

  getPrompt(
    serverName: string,
    promptName: string,
  ): DiscoveredMcpPrompt | undefined {
    return this.prompts.get(this.getPromptKey(serverName, promptName));
  }

  getAllPrompts(): DiscoveredMcpPrompt[] {
    return Array.from(this.prompts.values());
  }

  private getPromptKey(serverName: string, promptName: string): string {
    return `${serverName}/${promptName}`;
  }
}

export const promptRegistry = new PromptRegistry();