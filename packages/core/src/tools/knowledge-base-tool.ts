/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { ToolResult } from './tools.js';
import { BasePythonTool } from './base-python-tool.js';

/**
 * Knowledge base operations
 */
export type KnowledgeBaseOperation = 'store' | 'search' | 'get' | 'list_collections' | 'advanced_search';

/**
 * Parameters for knowledge base operations
 */
export interface KnowledgeBaseParams {
  /** Operation to perform */
  op: KnowledgeBaseOperation;

  /** Markdown content to store (for store operation) */
  content?: string;

  /** Path to markdown file to store (for store operation, alternative to content) */
  file_path?: string;

  /** Search query (for search operation) */
  query?: string;

  /** Number of results to return (for search operation) */
  limit?: number;

  /** Metadata for the content */
  metadata?: {
    source_file?: string;
    title?: string;
    author?: string;
    date?: string;
    [key: string]: string | undefined;
  };

  /** Collection name (defaults to 'default') */
  collection?: string;

  /** Advanced search and retrieval options */
  where?: Record<string, unknown>;  // Metadata filtering: {"author": "John", "page": {"$gt": 10}}
  where_document?: Record<string, unknown>;  // Full-text search: {"$contains": "search term"}
  content_mode?: 'chunks' | 'full' | 'metadata_only';  // Content inclusion level
  similarity_threshold?: number;  // Minimum similarity score (0-1)

  /** Document management */
  document_ids?: string[];  // Specific document IDs to retrieve

  /** Result formatting */
  include_metadata?: boolean;  // Include metadata in results (default: true)
  include_distances?: boolean;  // Include similarity distances (default: true)
}

/**
 * Knowledge Base Tool - Simple storage and retrieval for markdown content
 */
export class KnowledgeBaseTool extends BasePythonTool<KnowledgeBaseParams, ToolResult> {
  static readonly Name = 'knowledge_base';

  constructor(config: Config) {
    super(
      KnowledgeBaseTool.Name,
      'KnowledgeBase',
      `Store and retrieve markdown content using semantic similarity search. Build a persistent, searchable knowledge base that remembers information across conversations.

# WHEN TO USE THIS TOOL
- Save code snippets, solutions, or patterns that worked well for future reference
- Store documentation, guides, or reference materials for later retrieval
- Build a personal knowledge base from markdown files converted by markitdown
- Search for previously saved solutions when facing similar problems
- Preserve context and learnings that should persist beyond the current conversation

# USAGE EXAMPLES

## Example 1: Save a successful code snippet
\`\`\`
{
  "op": "store",
  "content": "# Excel Data Export\\n\\nSuccessfully exported data using xlwings:\\n\\n\`\`\`python\\nimport xlwings as xw\\nbook = xw.Book('data.xlsx')\\nsheet = book.sheets[0]\\ndata = sheet.range('A1').expand('table').value\\n\`\`\`",
  "metadata": {
    "title": "Excel Export with xlwings",
    "category": "code_snippet",
    "language": "python"
  }
}
\`\`\`

## Example 2: Store a markdown file
\`\`\`
{
  "op": "store",
  "file_path": "C:\\\\docs\\\\api-reference.md",
  "metadata": {
    "title": "API Reference Documentation",
    "source": "company_docs",
    "date": "2025-01-15"
  }
}
\`\`\`

## Example 3: Search for relevant content
\`\`\`
{
  "op": "search",
  "query": "how to read excel file with xlwings",
  "limit": 3
}
\`\`\`

## Example 4: Advanced search with filters
\`\`\`
{
  "op": "advanced_search",
  "query": "data visualization",
  "where": {"category": "code_snippet", "language": "python"},
  "similarity_threshold": 0.7,
  "limit": 5
}
\`\`\`

# OPERATIONS GUIDE

## store - Save content to knowledge base
- Use \`content\` parameter for direct text input (code snippets, notes)
- Use \`file_path\` parameter to load from a markdown file
- Add \`metadata\` to make content more searchable (title, category, tags, date, author)
- Content is automatically split into semantic chunks for optimal retrieval

## search - Find relevant content (simple semantic search)
- Provide a natural language \`query\` describing what you're looking for
- Returns top matching chunks with similarity scores
- Use \`limit\` to control number of results (default: 5)

## advanced_search - Powerful search with filters
- Combine semantic search with metadata filtering
- \`where\`: Filter by metadata (e.g., {"category": "api", "language": "python"})
- \`where_document\`: Full-text search within content (e.g., {"$contains": "xlwings"})
- \`similarity_threshold\`: Only return results above this score (0-1)
- \`content_mode\`: "chunks" (default), "full" (complete docs), or "metadata_only"

## get - Retrieve specific documents by ID
- Use document IDs from previous search results
- Useful when you know exactly which documents you need

## list_collections - Show all knowledge base collections
- Lists all available collections with their metadata
- Useful for organizing different types of content

# BEST PRACTICES
- Save successful solutions immediately after they work
- Use descriptive titles and consistent metadata for better searchability
- Search before solving - check if you've encountered similar problems before
- Organize related content into collections (e.g., "excel_automation", "api_examples")
- Include context in metadata (date, project, source) for better filtering
- For large documents, let the tool handle chunking automatically

# TECHNICAL DETAILS
- Uses ChromaDB for vector storage and semantic search
- Content is automatically embedded using sentence transformers
- Chunks are 800 characters with 100 character overlap for context preservation
- Knowledge base is stored persistently in .gemini/knowledge_base directory
- Similarity scores range from 0 (unrelated) to 1 (identical)`,
      ['chromadb'], // Required Python packages
      {
        properties: {
          op: {
            description: 'Operation to perform: store (save content), search (semantic search), get (retrieve by ID), list_collections (show all collections), advanced_search (combined semantic + metadata + full-text search)',
            type: 'string',
            enum: ['store', 'search', 'get', 'list_collections', 'advanced_search']
          },
          content: {
            description: 'Markdown content to store (for store operation, either content or file_path required)',
            type: 'string'
          },
          file_path: {
            description: 'Path to markdown file to store (for store operation, alternative to content)',
            type: 'string'
          },
          query: {
            description: 'Search query text (required for search operation)',
            type: 'string'
          },
          limit: {
            description: 'Maximum number of search results to return (default: 5)',
            type: 'number',
            minimum: 1,
            maximum: 20
          },
          metadata: {
            description: 'Optional metadata for the content (source_file, title, author, date, etc.)',
            type: 'object',
            properties: {
              source_file: { type: 'string' },
              title: { type: 'string' },
              author: { type: 'string' },
              date: { type: 'string' }
            },
            additionalProperties: { type: 'string' }
          },
          collection: {
            description: 'Collection name to store/search in (default: "default")',
            type: 'string'
          },
          where: {
            description: 'Metadata filtering (advanced_search): {"author": "John", "page": {"$gt": 10}}',
            type: 'object'
          },
          where_document: {
            description: 'Full-text search filtering (advanced_search): {"$contains": "search term"}',
            type: 'object'
          },
          content_mode: {
            description: 'Content inclusion level: chunks (default, semantic chunks), full (complete documents), metadata_only (just metadata)',
            type: 'string',
            enum: ['chunks', 'full', 'metadata_only']
          },
          similarity_threshold: {
            description: 'Minimum similarity score 0-1 (advanced_search)',
            type: 'number',
            minimum: 0,
            maximum: 1
          },
          document_ids: {
            description: 'Specific document IDs to retrieve (get operation)',
            type: 'array',
            items: { type: 'string' }
          },
          include_metadata: {
            description: 'Include metadata in results (default: true)',
            type: 'boolean'
          },
          include_distances: {
            description: 'Include similarity distances in results (default: true)',
            type: 'boolean'
          }
        },
        required: ['op'],
        type: 'object'
      },
      config,
      true, // isOutputMarkdown
      false // canUpdateOutput
    );
  }

  protected override validateToolParamValues(params: KnowledgeBaseParams): string | null {
    const { op, content, file_path, query, document_ids } = params;

    switch (op) {
      case 'store':
        if (!content && !file_path) {
          return 'Either content or file_path is required for store operation';
        }
        if (content && content.trim().length === 0) {
          return 'content cannot be empty if provided';
        }
        break;

      case 'search':
        if (!query || query.trim().length === 0) {
          return 'query is required and cannot be empty for search operation';
        }
        break;

      case 'advanced_search':
        if (!query || query.trim().length === 0) {
          return 'query is required and cannot be empty for advanced_search operation';
        }
        break;

      case 'get':
        if (!document_ids || document_ids.length === 0) {
          return 'document_ids is required and cannot be empty for get operation';
        }
        break;

      case 'list_collections':
        // No validation needed
        break;

      default:
        return `Unknown operation: ${op}`;
    }

    return null;
  }

  protected parseResult(pythonOutput: string, params: KnowledgeBaseParams): ToolResult {
    try {
      // Clean the output to handle potential non-JSON prefixes
      let cleanOutput = pythonOutput.trim();

      // If output starts with "Error:", extract the error part
      if (cleanOutput.startsWith('Error:')) {
        return {
          returnDisplay: `❌ **Python Error:** ${cleanOutput}`,
          llmContent: `Knowledge base operation failed: ${cleanOutput}`
        };
      }

      // Try to find JSON in the output
      const jsonMatch = cleanOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanOutput = jsonMatch[0];
      }

      const result = JSON.parse(cleanOutput);

      // Generate helpful response based on operation
      if (result.status === 'error' || result.error) {
        return {
          returnDisplay: `❌ **Error:** ${result.error}`,
          llmContent: `Knowledge base operation failed: ${result.error}`
        };
      }

      if (params.op === 'store') {
        return {
          returnDisplay: `✅ **Content stored successfully!**

📄 **Source:** ${result.source || 'Direct content'}
🗂️ **Collection:** ${params.collection || 'default'}
📊 **Chunks:** ${result.chunks_stored || 0}
📝 **Characters:** ${result.total_characters || 0}`,
          llmContent: `Content successfully stored in knowledge base. ${result.chunks_stored || 0} chunks created from ${result.total_characters || 0} characters.`
        };
      } else if (params.op === 'search') {
        const results = Array.isArray(result) ? result : [];
        if (results.length === 0) {
          return {
            returnDisplay: `🔍 **No results found**\n\nNo matching content found for: "${params.query}"`,
            llmContent: `No results found in knowledge base for query: "${params.query}"`
          };
        }

        const displayResults = results.slice(0, 3).map((r, i) =>
          `**Result ${i + 1}** (similarity: ${r.similarity || 0})\n${r.content?.substring(0, 200) || ''}${r.content?.length > 200 ? '...' : ''}`
        ).join('\n\n');

        return {
          returnDisplay: `🔍 **Found ${results.length} results**\n\n${displayResults}`,
          llmContent: JSON.stringify(results, null, 2)
        };
      } else if (params.op === 'advanced_search') {
        const results = result.results || [];
        if (results.length === 0) {
          return {
            returnDisplay: `🔍 **No results found**\n\nQuery: "${result.query || params.query}"\nFilters applied: ${JSON.stringify(result.filters || {})}`,
            llmContent: `No results found for advanced search query: "${params.query}"`
          };
        }

        interface SearchResult {
          similarity?: number;
          content?: string;
          metadata?: Record<string, unknown>;
        }
        const displayResults = results.slice(0, 3).map((r: SearchResult, i: number) =>
          `**Result ${i + 1}** (similarity: ${r.similarity || 0})\n${params.content_mode === 'full' ? r.content : r.content?.substring(0, 200) + '...' || ''}${r.metadata ? `\n*Metadata: ${JSON.stringify(r.metadata)}*` : ''}`
        ).join('\n\n');

        return {
          returnDisplay: `🔍 **Advanced Search Results** (${results.length} found)\n\n${displayResults}`,
          llmContent: JSON.stringify(results, null, 2)
        };
      } else if (params.op === 'get') {
        const documents = result.documents || [];
        interface Document {
          id?: string;
          content?: string;
        }
        return {
          returnDisplay: `📄 **Retrieved ${documents.length} documents**\n\n${documents.map((doc: Document, i: number) =>
            `**Document ${i + 1}**: ${doc.id}\n${params.content_mode !== 'metadata_only' ? (doc.content?.substring(0, 200) + '...' || 'No content') : 'Metadata only'}`
          ).join('\n\n')}`,
          llmContent: JSON.stringify(documents, null, 2)
        };
      } else if (params.op === 'list_collections') {
        const collections = result.collections || [];
        interface Collection {
          name?: string;
          metadata?: Record<string, unknown>;
        }
        return {
          returnDisplay: `📚 **Available Collections** (${collections.length})\n\n${collections.map((col: Collection) =>
            `• **${col.name}**${col.metadata ? ` - ${JSON.stringify(col.metadata)}` : ''}`
          ).join('\n')}`,
          llmContent: JSON.stringify(collections, null, 2)
        };
      }

      return {
        returnDisplay: `✅ Operation completed: ${params.op}`,
        llmContent: JSON.stringify(result, null, 2)
      };
    } catch (error) {
      return {
        returnDisplay: `❌ **Failed to parse results**\n\nError: ${error}\n\nRaw output:\n\`\`\`\n${pythonOutput.substring(0, 500)}...\n\`\`\``,
        llmContent: `Error parsing knowledge base results: ${error}`
      };
    }
  }

  protected generatePythonCode(params: KnowledgeBaseParams): string {
    const {
      op,
      content = '',
      file_path = '',
      query = '',
      limit = 5,
      metadata = {},
      collection = 'default',
      where = {},
      where_document = {},
      content_mode = 'chunks',
      similarity_threshold = 0,
      document_ids = [],
      include_metadata = true,
      include_distances = true
    } = params;

    return `
import os
import json
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings

class SimpleKnowledgeBase:
    def __init__(self, collection_name: str = "default"):
        self.collection_name = collection_name

        # Create knowledge base directory
        self.kb_dir = Path(".gemini/knowledge_base")
        self.kb_dir.mkdir(parents=True, exist_ok=True)

        # Initialize Chroma client
        self.client = chromadb.PersistentClient(
            path=str(self.kb_dir),
            settings=Settings(allow_reset=True)
        )

        # Get or create collection
        try:
            self.collection = self.client.get_collection(name=collection_name)
        except:
            self.collection = self.client.create_collection(
                name=collection_name,
                metadata={"description": f"Knowledge base collection: {collection_name}"}
            )

    def chunk_text(self, text: str, chunk_size: int = 800, overlap: int = 100) -> List[str]:
        """Split text into overlapping chunks"""
        if len(text) <= chunk_size:
            return [text]

        chunks = []
        start = 0

        while start < len(text):
            end = start + chunk_size

            if end >= len(text):
                # Last chunk
                chunks.append(text[start:].strip())
                break

            # Try to find a good breaking point
            chunk = text[start:end]

            # Look for sentence endings
            last_period = chunk.rfind('.')
            last_newline = chunk.rfind('\\n\\n')  # Paragraph break
            last_exclamation = chunk.rfind('!')
            last_question = chunk.rfind('?')

            # Choose the best breaking point
            break_points = [p for p in [last_period, last_newline, last_exclamation, last_question] if p > start + chunk_size // 2]

            if break_points:
                best_break = max(break_points)
                end = start + best_break + 1

            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)

            # Move start position with overlap
            start = end - overlap if end < len(text) else end

        return [chunk for chunk in chunks if chunk.strip()]

    def store_content(self, content: str = None, file_path: str = None, metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """Store markdown content in the knowledge base"""
        if metadata is None:
            metadata = {}

        try:
            # Get content from file if file_path is provided
            if file_path:
                if not os.path.exists(file_path):
                    return {
                        "status": "error",
                        "error": f"File not found: {file_path}"
                    }

                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Auto-populate metadata from file
                file_name = os.path.basename(file_path)
                if 'source_file' not in metadata:
                    metadata['source_file'] = file_path
                if 'title' not in metadata:
                    metadata['title'] = os.path.splitext(file_name)[0]

            elif content is None:
                return {
                    "status": "error",
                    "error": "Either content or file_path must be provided"
                }

            if not content.strip():
                return {
                    "status": "error",
                    "error": "Content cannot be empty"
                }

            # Generate unique ID for this content
            content_hash = hashlib.md5(content.encode('utf-8')).hexdigest()

            # Split content into chunks
            chunks = self.chunk_text(content)

            # Prepare chunk data
            chunk_ids = []
            chunk_documents = []
            chunk_metadatas = []

            for i, chunk in enumerate(chunks):
                chunk_id = f"{content_hash}_chunk_{i}"
                chunk_ids.append(chunk_id)
                chunk_documents.append(chunk)

                chunk_metadata = {
                    "content_id": content_hash,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "chunk_length": len(chunk),
                    **metadata  # Include user-provided metadata
                }
                chunk_metadatas.append(chunk_metadata)

            # Store in Chroma
            self.collection.add(
                documents=chunk_documents,
                metadatas=chunk_metadatas,
                ids=chunk_ids
            )

            return {
                "status": "success",
                "content_id": content_hash,
                "chunks_stored": len(chunks),
                "total_characters": len(content),
                "collection": self.collection_name,
                "source": file_path if file_path else "direct_content"
            }

        except Exception as e:
            return {
                "status": "error",
                "error": str(e)
            }

    def search_content(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search for relevant content"""
        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=limit
            )

            search_results = []

            if results['ids'] and results['ids'][0]:
                for i, (chunk_id, document, metadata, distance) in enumerate(zip(
                    results['ids'][0],
                    results['documents'][0],
                    results['metadatas'][0],
                    results['distances'][0] if results['distances'] else [0] * len(results['ids'][0])
                )):
                    # Convert distance to similarity score
                    similarity = max(0, 1 - distance)

                    search_results.append({
                        "chunk_id": chunk_id,
                        "content": document,
                        "similarity": round(similarity, 3),
                        "metadata": metadata,
                        "source_file": metadata.get("source_file", ""),
                        "title": metadata.get("title", ""),
                        "chunk_index": metadata.get("chunk_index", 0)
                    })

            return search_results

        except Exception as e:
            return [{"error": str(e)}]

    def get_documents(self, document_ids: list, content_mode: str = "chunks"):
        """Get specific documents by IDs"""
        try:
            # Build include list based on content_mode (ids are always included by default)
            include = []
            if content_mode == "metadata_only":
                include.append("metadatas")
            elif content_mode == "chunks":
                include.extend(["documents", "metadatas"])
            elif content_mode == "full":
                include.extend(["documents", "metadatas"])

            results = self.collection.get(
                ids=document_ids,
                include=include
            )

            documents = []
            if results['ids']:
                for i, doc_id in enumerate(results['ids']):
                    doc_info = {"id": doc_id}

                    if content_mode != "metadata_only" and 'documents' in results:
                        doc_info["content"] = results['documents'][i]

                    if 'metadatas' in results and results['metadatas'][i]:
                        doc_info["metadata"] = results['metadatas'][i]

                    documents.append(doc_info)

            return {
                "status": "success",
                "documents": documents,
                "count": len(documents)
            }

        except Exception as e:
            return {"error": str(e)}

    def list_collections(self):
        """List all collections in the database"""
        try:
            collections = self.client.list_collections()
            return {
                "status": "success",
                "collections": [{"name": col.name, "metadata": col.metadata} for col in collections]
            }
        except Exception as e:
            return {"error": str(e)}

    def advanced_search(self, query: str, limit: int = 5, where=None, where_document=None,
                       content_mode: str = "chunks", similarity_threshold: float = 0,
                       include_metadata: bool = True, include_distances: bool = True):
        """Advanced search with metadata filtering, full-text search, and content control"""
        try:
            # Build include list (ids are always included by default)
            include = ["documents"]
            if include_metadata:
                include.append("metadatas")
            if include_distances:
                include.append("distances")

            # Perform query
            query_params = {
                "query_texts": [query],
                "n_results": limit,
                "include": include
            }

            if where:
                query_params["where"] = where
            if where_document:
                query_params["where_document"] = where_document

            results = self.collection.query(**query_params)

            search_results = []
            if results['ids'] and results['ids'][0]:
                for i, (chunk_id, document) in enumerate(zip(results['ids'][0], results['documents'][0])):
                    # Calculate similarity and apply threshold
                    distance = results['distances'][0][i] if include_distances and results['distances'] else 0
                    similarity = max(0, 1 - distance)

                    if similarity < similarity_threshold:
                        continue

                    result_item = {
                        "chunk_id": chunk_id,
                        "similarity": round(similarity, 3)
                    }

                    # Add content based on mode
                    if content_mode == "full":
                        result_item["content"] = document
                    elif content_mode == "chunks":
                        # Return chunk with preview
                        result_item["content"] = document[:500] + "..." if len(document) > 500 else document
                        result_item["full_content"] = document
                    elif content_mode == "metadata_only":
                        # Only metadata, no content
                        pass

                    # Add metadata if requested
                    if include_metadata and 'metadatas' in results and results['metadatas'][0][i]:
                        result_item["metadata"] = results['metadatas'][0][i]

                    # Add distance if requested
                    if include_distances:
                        result_item["distance"] = round(distance, 4)

                    search_results.append(result_item)

            return {
                "status": "success",
                "results": search_results,
                "total_found": len(search_results),
                "query": query,
                "filters": {
                    "where": where,
                    "where_document": where_document,
                    "similarity_threshold": similarity_threshold
                }
            }

        except Exception as e:
            return {"error": str(e)}

# Main execution
def main():
    try:
        kb = SimpleKnowledgeBase("${collection}")

        operation = "${op}"

        if operation == "store":
            content = """${content.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}""" if """${content}""" else None
            file_path = r"${file_path}" if "${file_path}" else None
            metadata = ${JSON.stringify(metadata)}
            result = kb.store_content(content=content, file_path=file_path, metadata=metadata)

        elif operation == "search":
            query = """${query.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"""
            result = kb.search_content(query, limit=${limit})

        elif operation == "get":
            document_ids = ${JSON.stringify(document_ids)}
            result = kb.get_documents(document_ids, content_mode="${content_mode}")

        elif operation == "list_collections":
            result = kb.list_collections()

        elif operation == "advanced_search":
            query = """${query.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"""
            where_filter = ${JSON.stringify(where)}
            where_doc_filter = ${JSON.stringify(where_document)}
            result = kb.advanced_search(
                query=query,
                limit=${limit},
                where=where_filter if where_filter else None,
                where_document=where_doc_filter if where_doc_filter else None,
                content_mode="${content_mode}",
                similarity_threshold=${similarity_threshold},
                include_metadata=${include_metadata ? 'True' : 'False'},
                include_distances=${include_distances ? 'True' : 'False'}
            )

        else:
            result = {"status": "error", "error": f"Unknown operation: {operation}"}

    except Exception as e:
        result = {
            "status": "error",
            "error": str(e),
            "error_type": type(e).__name__
        }

    try:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as json_error:
        # Fallback if JSON serialization fails
        print(json.dumps({
            "status": "error",
            "error": f"JSON serialization failed: {str(json_error)}",
            "original_error": str(result) if 'result' in locals() else "Unknown"
        }))

if __name__ == "__main__":
    main()
`;
  }
}