import { Agent } from '@mastra/core';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import type { AccelosConfig } from './config.js';
import { getCompatiblePaths } from './config.js';
import { fileAnalyzerTool, webSearchTool, codeAnalysisTool, claudeCodeTool } from './tools/index.js';
import { GuardrailStore } from './tools/shared-guardrail-store.js';

export class AccelosAgent {
  private agent: Agent;
  private config: AccelosConfig;

  constructor(config: AccelosConfig) {
    this.config = config;
    
    const llmProvider = this.getLLMProvider();
    
    this.agent = new Agent({
      name: 'Accelos',
      instructions: config.systemPrompt,
      model: llmProvider,
      tools: [fileAnalyzerTool, webSearchTool, codeAnalysisTool, claudeCodeTool],
    });

    // Initialize guardrails at startup (async, non-blocking)
    this.initializeGuardrails().catch(error => {
      console.warn(`⚠️  Failed to initialize guardrails: ${error instanceof Error ? error.message : 'Unknown error'}`);
    });
  }

  private async initializeGuardrails(): Promise<void> {
    console.log(`🔧 DEBUG: initializeGuardrails() started`);
    const guardrailStore = GuardrailStore.getInstance();
    const guardrailsFile = getCompatiblePaths(this.config).guardrailsFile;
    
    console.log(`🛡️  Loading guardrails from: ${guardrailsFile}`);
    console.log(`🔧 DEBUG: Calling loadFromFile with autoSave=true`);
    const result = await guardrailStore.loadFromFile(guardrailsFile, true); // Enable auto-save
    
    console.log(`✅ Loaded ${result.loaded} guardrails with auto-save enabled`);
    console.log(`🔧 DEBUG: Startup initialization completed`);
    if (result.errors.length > 0) {
      console.warn(`⚠️  Guardrail loading errors:`, result.errors);
    }
  }

  private getLLMProvider() {
    const { llmProvider, model, apiKey } = this.config;

    switch (llmProvider) {
      case 'google':
        return google(model);
      case 'openai':
        return openai(model);
      case 'anthropic':
        return anthropic(model);
      default:
        throw new Error(`Unsupported LLM provider: ${llmProvider}`);
    }
  }

  async chat(message: string, context?: any): Promise<string> {
    try {
      const response = await this.agent.generate(message);
      return response.text || 'No response generated';
    } catch (error) {
      console.error('Error in Accelos agent chat:', error);
      throw new Error(`Chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getGuardrailStats() {
    return GuardrailStore.getInstance().getStats();
  }

  async analyzeFile(filePath: string, analysisType: 'content' | 'structure' | 'security' | 'all' = 'all') {
    try {
      const result = await this.agent.generate(
        `Please analyze the file at "${filePath}" using the file analyzer tool with analysis type "${analysisType}". Provide insights about the file's purpose, structure, and any recommendations.`
      );

      return result.text || 'Analysis failed';
    } catch (error) {
      console.error('Error in file analysis:', error);
      throw new Error(`File analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchWeb(query: string, maxResults: number = 5): Promise<string> {
    try {
      const result = await this.agent.generate(
        `Search the web for "${query}" and return up to ${maxResults} relevant results. Summarize the findings.`
      );

      return result.text || 'Search failed';
    } catch (error) {
      console.error('Error in web search:', error);
      throw new Error(`Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async analyzeCode(code: string, language: string = 'auto'): Promise<string> {
    try {
      const result = await this.agent.generate(
        `Analyze this ${language} code for quality, complexity, and issues. Provide detailed feedback and suggestions:\n\n\`\`\`${language}\n${code}\n\`\`\``
      );

      return result.text || 'Code analysis failed';
    } catch (error) {
      console.error('Error in code analysis:', error);
      throw new Error(`Code analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getConfig(): AccelosConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<AccelosConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    const llmProvider = this.getLLMProvider();
    this.agent = new Agent({
      name: 'Accelos',
      instructions: this.config.systemPrompt,
      model: llmProvider,
      tools: [fileAnalyzerTool, webSearchTool, codeAnalysisTool],
    });
  }
}