import { createTool } from '@mastra/core';
import { z } from 'zod';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export const webSearchTool = createTool({
  id: 'web-search',
  description: 'Search the web for information and return relevant results',
  inputSchema: z.object({
    query: z.string().describe('Search query to look for'),
    maxResults: z.number().min(1).max(10).default(5).describe('Maximum number of results to return'),
    safeSearch: z.boolean().default(true).describe('Enable safe search filtering'),
  }),
  outputSchema: z.object({
    query: z.string(),
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      relevanceScore: z.number().min(0).max(1).optional(),
    })),
    totalResults: z.number(),
    searchTime: z.number(),
  }),
  execute: async ({ context }) => {
    const { query, maxResults, safeSearch } = context;
    const startTime = Date.now();

    try {
      const simulatedResults: SearchResult[] = [
        {
          title: `How to ${query} - Complete Guide`,
          url: `https://example.com/guide/${encodeURIComponent(query)}`,
          snippet: `Learn everything about ${query} with this comprehensive guide. Step-by-step instructions and best practices.`,
        },
        {
          title: `${query} - Wikipedia`,
          url: `https://wikipedia.org/wiki/${encodeURIComponent(query)}`,
          snippet: `Wikipedia article about ${query}. Comprehensive information and references.`,
        },
        {
          title: `Best practices for ${query}`,
          url: `https://bestpractices.dev/${encodeURIComponent(query)}`,
          snippet: `Industry best practices and recommendations for ${query}. Expert insights and tips.`,
        },
        {
          title: `${query} Tutorial - Stack Overflow`,
          url: `https://stackoverflow.com/questions/tagged/${encodeURIComponent(query)}`,
          snippet: `Community questions and answers about ${query}. Real-world solutions and code examples.`,
        },
        {
          title: `Latest ${query} News and Updates`,
          url: `https://tech-news.com/topics/${encodeURIComponent(query)}`,
          snippet: `Stay updated with the latest news and developments related to ${query}.`,
        },
      ];

      const results = simulatedResults.slice(0, maxResults).map((result, index) => ({
        ...result,
        relevanceScore: Math.max(0.5, 1 - (index * 0.1)),
      }));

      const searchTime = Date.now() - startTime;

      return {
        query,
        results,
        totalResults: results.length,
        searchTime,
      };
    } catch (error) {
      throw new Error(`Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});