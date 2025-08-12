import { Agent } from '@mastra/core';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import type { AccelosConfig } from './config.js';
import { fileAnalyzerTool, webSearchTool, codeAnalysisTool } from './tools/index.js';

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
      tools: [fileAnalyzerTool, webSearchTool, codeAnalysisTool],
    });
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