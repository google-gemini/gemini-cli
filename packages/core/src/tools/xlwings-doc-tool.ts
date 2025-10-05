/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasePythonTool } from './base-python-tool.js';
import type { ToolResult } from './tools.js';
import type { Config } from '../config/config.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Parameters for xlwings documentation query operations
 */
interface XlwingsDocParams {
  /** Operation type - always 'doc_query' for this tool */
  op: 'doc_query';

  /**
   * Search query for documentation. Examples of good queries:
   * - "how to read data from Excel range"
   * - "write dataframe to Excel sheet"
   * - "create chart with xlwings"
   * - "format cells with colors and fonts"
   * - "insert image from file"
   * - "run VBA macro from Python"
   * - "use pictures.add with matplotlib"
   * - "workbook save and close"
   * - "sheet operations add delete"
   */
  query: string;

  /**
   * Number of documentation results to return (default: 5, max: 20)
   */
  limit?: number;
}

/**
 * Result from documentation query operations
 */
interface XlwingsDocResult extends ToolResult {
  success: boolean;
  operation: string;
  query?: string;
  results_count?: number;
  results?: Array<{
    content: string;
    metadata: {
      source: string;
      section?: string;
    };
    score: number;
  }>;
  xlwings_error?: string;
}


/**
 * Tool for querying xlwings documentation
 */
export class XlwingsDocTool extends BasePythonTool<XlwingsDocParams, XlwingsDocResult> {
  static readonly Name: string = 'xlwings_doc_tool';

  constructor(config: Config) {
    super(
      'xlwings_doc_tool',
      'xlwings Documentation Query',
      'Search built-in xlwings documentation to learn correct syntax, API usage, and best practices. Use this tool when you need to understand how to perform Excel operations with xlwings. Requires chromadb Python library.',
      ['chromadb'], // Python requirements
      {
        type: 'object',
        required: ['query'],
        properties: {
          op: {
            type: 'string',
            enum: ['doc_query'],
            description: 'Operation type - always doc_query for this tool'
          },
          query: {
            type: 'string',
            description: `Use this tool when you need to learn correct xlwings syntax, API usage, or best practices before performing Excel operations.Search query for xlwings documentation. 
Examples of good queries:
- "Automate/interact with Excel from Python"
- "Connect to a book"
- "Data structures"
- "Top-Level functions"
- "Matplotlib & plotly charts"
- "Workaround to use VBA"
- "Read/write big DataFrames"
Examples of keyworks to include in your query:
- "range"
- "chart"
- "dataframe"
- "table", "tables"
- "pandas"
- "numpy"
- "macro"
- "app"
- "book", "books"
- "characters"
- "chart", "charts"
- "PageSetup"
- "picture", "pictures"
- "shape", "shapes"
- "note"
- "range", "RangeColumns", "RangeRows"
- "reports"
- "converter"
- "chunk"
- "example"
`
          },
          limit: {
            type: 'number',
            description: 'Number of documentation results to return (default: 5, max: 20)',
            minimum: 1,
            maximum: 20
          }
        }
      },
      config,
    );
  }

  protected generatePythonCode(params: XlwingsDocParams): string {
    const query = params.query || '';
    const limit = params.limit || 5;

    // Get the directory of the current module
    const currentFileUrl = import.meta.url;
    const currentFilePath = fileURLToPath(currentFileUrl);
    const currentDir = path.dirname(currentFilePath);

    // Navigate to the data/xlwings_docs_db directory
    // From dist/src/tools to packages/core/data/xlwings_docs_db: ../../../data/xlwings_docs_db
    const docsDbPath = path.join(currentDir, '..', '..', '..', 'data', 'xlwings_docs_db').replace(/\\/g, '/');

    return `
import sys
import json
import os
from pathlib import Path

try:
    import chromadb
    from chromadb.config import Settings
except ImportError:
    print(json.dumps({
        "success": False,
        "operation": "doc_query",
        "error": "chromadb library is not installed. Please install it using: pip install chromadb"
    }))
    sys.exit(1)

try:
    db_path = Path(r"${docsDbPath.replace(/\\/g, '\\\\')}")
    if not db_path.exists():
        print(json.dumps({
            "success": False,
            "operation": "doc_query",
            "error": f"Documentation database not found. Searched at: {db_path}. Absolute path: {db_path.absolute()}"
        }))
        sys.exit(1)

    # Initialize ChromaDB client
    client = chromadb.PersistentClient(
        path=str(db_path),
        settings=Settings(
            anonymized_telemetry=False,
            allow_reset=False
        )
    )

    # Get the collection
    collection = client.get_collection("xlwings_docs")

    # Query the collection
    results = collection.query(
        query_texts=[${JSON.stringify(query)}],
        n_results=${limit}
    )

    # Format results
    formatted_results = []
    if results['documents'] and results['documents'][0]:
        for i, doc in enumerate(results['documents'][0]):
            formatted_results.append({
                'content': doc,
                'metadata': results['metadatas'][0][i] if results['metadatas'] and results['metadatas'][0] else {},
                'score': 1 - results['distances'][0][i] if results['distances'] and results['distances'][0] else 0
            })

    result = {
        "success": True,
        "operation": "doc_query",
        "query": ${JSON.stringify(query)},
        "results_count": len(formatted_results),
        "results": formatted_results
    }

    print(json.dumps(result))
except Exception as e:
    print(json.dumps({
        "success": False,
        "operation": "doc_query",
        "error": str(e)
    }))
    sys.exit(1)
`;
  }

  protected parseResult(pythonOutput: string, params: XlwingsDocParams): XlwingsDocResult {
    try {
      // Try to find JSON in the output
      const lines = pythonOutput.trim().split('\n');

      // Look for a line that looks like JSON (starts with { and ends with })
      let jsonLine = '';
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && line.endsWith('}')) {
          jsonLine = line;
          break;
        }
      }

      if (!jsonLine) {
        throw new Error(`No JSON found in Python output. Output: ${pythonOutput.substring(0, 500)}`);
      }

      const result = JSON.parse(jsonLine);

      if (!result.success) {
        return {
          success: false,
          operation: 'doc_query',
          xlwings_error: result.error || 'Documentation query failed',
          llmContent: `Failed to query xlwings documentation: ${result.error}`,
          returnDisplay: `❌ **Documentation Query Failed**\n\n${result.error}`
        };
      }

      const results = result.results || [];

      if (results.length === 0) {
        return {
          success: true,
          operation: 'doc_query',
          llmContent: `No documentation found for query: "${params.query}"`,
          returnDisplay: `🔍 **No Results Found**\n\nQuery: "${params.query}"\n\nTry different keywords or check the documentation.`
        };
      }

      // Format results for display
      const llmContent = `Found ${results.length} documentation results for "${params.query}":\n\n` +
        results.map((r: { content: string; metadata: { source: string; section?: string }; score: number }, i: number) =>
          `${i + 1}. [${r.metadata.source}${r.metadata.section ? ` - ${r.metadata.section}` : ''}] (relevance: ${(r.score * 100).toFixed(1)}%)\n${r.content}`
        ).join('\n\n---\n\n');

      const returnDisplay = `📚 **xlwings Documentation Results** (${results.length} found)\n\n` +
        results.map((r: { content: string; metadata: { source: string; section?: string }; score: number }, i: number) =>
          `### ${i + 1}. ${r.metadata.source}${r.metadata.section ? ` - ${r.metadata.section}` : ''}\n**Relevance:** ${(r.score * 100).toFixed(1)}%\n\n${r.content}`
        ).join('\n\n---\n\n');

      return {
        success: true,
        operation: 'doc_query',
        llmContent,
        returnDisplay
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        operation: 'doc_query',
        xlwings_error: errorMessage,
        llmContent: `Error parsing documentation query results: ${errorMessage}`,
        returnDisplay: `❌ **Error**\n\n${errorMessage}`
      };
    }
  }

  protected override requiresConfirmation(_params: XlwingsDocParams): boolean {
    // Documentation queries are read-only operations, no confirmation needed
    return false;
  }
}
