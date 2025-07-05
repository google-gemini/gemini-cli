import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
  Candidate,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { ContentGenerator, ContentGeneratorConfig } from '../core/contentGenerator.js';

export class AzureContentGenerator implements ContentGenerator {
  constructor(private config: ContentGeneratorConfig) {}

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    // Implement Azure OpenAI API call here
    throw new Error('Not implemented');
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // Implement Azure OpenAI API call here
    throw new Error('Not implemented');
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Implement Azure OpenAI API call here
    throw new Error('Not implemented');
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Implement Azure OpenAI API call here
    throw new Error('Not implemented');
  }
}
