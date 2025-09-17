/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { ToolResult } from './tools.js';
import { BasePythonTool } from './base-python-tool.js';
import { ToolErrorType } from './tool-error.js';

/**
 * Supported document formats for conversion
 */
export type DocumentFormat = 'pdf' | 'docx' | 'pptx' | 'xlsx';

/**
 * Parameters for MarkItDown tool operations
 */
export interface MarkItDownParams {
  /** Operation to perform */
  op: 'convert' | 'extract_text' | 'analyze_structure';

  /** Path to the document file */
  file_path: string;

  /** Optional output path for converted markdown (defaults to same directory with .md extension) */
  output_path?: string;

  /** Whether to include metadata in the output */
  include_metadata?: boolean;

  /** Whether to extract images (if supported) */
  extract_images?: boolean;

  /** Maximum length of output (for large documents) */
  max_length?: number;
}

/**
 * Result structure for MarkItDown operations
 */
export interface MarkItDownResult extends ToolResult {
  /** Operation that was performed */
  operation?: string;

  /** Input file information */
  input_file?: {
    path?: string;
    format?: string;
    size?: number;
    exists?: boolean;
  };

  /** Conversion results */
  conversion?: {
    success?: boolean;
    output_path?: string;
    markdown_length?: number;
    preview?: string;
    full_content?: string;
  };

  /** Document structure analysis */
  structure?: {
    headings?: string[];
    tables_count?: number;
    images_count?: number;
    lists_count?: number;
    code_blocks_count?: number;
    total_paragraphs?: number;
  };

  /** Metadata extraction */
  metadata?: {
    title?: string;
    author?: string;
    created?: string;
    modified?: string;
    pages?: number;
    [key: string]: unknown;
  };

  /** Error information if any */
  error?: {
    message: string;
    type?: ToolErrorType;
    details?: string;
  };
}

/**
 * Tool for converting documents to Markdown using MarkItDown
 */
export class MarkItDownTool extends BasePythonTool<MarkItDownParams, MarkItDownResult> {
  constructor(config: Config) {
    super(
      'markitdown',
      'Document Converter',
      'Converts various document formats (PDF, DOCX, PPTX, XLSX) to Markdown for LLM processing. Extracts text, structure, and metadata from documents.',
      ['markitdown[pdf,docx,pptx,xlsx]'],
      {
        type: 'object',
        required: ['op', 'file_path'],
        properties: {
          op: {
            type: 'string',
            enum: ['convert', 'extract_text', 'analyze_structure'],
            description: 'Operation to perform: convert (full conversion to markdown), extract_text (simple text extraction), analyze_structure (document structure analysis)'
          },
          file_path: {
            type: 'string',
            description: 'Path to the document file (supports PDF, DOCX, PPTX, XLSX)'
          },
          output_path: {
            type: 'string',
            description: 'Optional output path for converted markdown (defaults to same directory with .md extension)'
          },
          include_metadata: {
            type: 'boolean',
            description: 'Whether to include metadata in the output (default: true)'
          },
          extract_images: {
            type: 'boolean',
            description: 'Whether to extract images if supported (default: false)'
          },
          max_length: {
            type: 'number',
            description: 'Maximum length of output for large documents (default: unlimited)'
          }
        }
      },
      config,
      true, // isOutputMarkdown
      false // canUpdateOutput
    );
  }

  protected generatePythonCode(params: MarkItDownParams): string {
    const operation = params.op;
    const filePath = params.file_path.replace(/\\/g, '/');
    const outputPath = params.output_path?.replace(/\\/g, '/');
    const includeMetadata = params.include_metadata !== false;
    const maxLength = params.max_length || 0;

    let pythonCode = `
import json
import sys
import os
from pathlib import Path
from markitdown import MarkItDown
import re

def safe_json_value(value):
    """Convert values to JSON-serializable format"""
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [safe_json_value(v) for v in value]
    if isinstance(value, dict):
        return {k: safe_json_value(v) for k, v in value.items()}
    return str(value)

# Initialize result
result = {
    "operation": "${operation}",
    "input_file": {},
    "conversion": {},
    "structure": {},
    "metadata": {},
    "error": None
}

try:
    # Check if file exists
    file_path = r"${filePath}"
    file_exists = os.path.exists(file_path)
    file_size = os.path.getsize(file_path) if file_exists else 0
    file_ext = Path(file_path).suffix.lower()

    result["input_file"] = {
        "path": file_path,
        "format": file_ext[1:] if file_ext else "unknown",
        "size": file_size,
        "exists": file_exists
    }

    if not file_exists:
        result["error"] = {
            "type": "FileNotFound",
            "message": f"File not found: {file_path}",
            "details": "Please check the file path and try again"
        }
    else:
        # Initialize MarkItDown
        md = MarkItDown()

        # Convert document
        conversion_result = md.convert(file_path)
        markdown_content = conversion_result.text_content if hasattr(conversion_result, 'text_content') else str(conversion_result)

        if not markdown_content:
            result["error"] = {
                "type": "ConversionError",
                "message": "No content extracted from document",
                "details": "The document might be empty or in an unsupported format"
            }
        else:
`;

    if (operation === 'convert') {
      pythonCode += `
            # Full conversion with optional output
            ${outputPath ? `
            output_path = r"${outputPath}"
            ` : `
            output_path = file_path.rsplit('.', 1)[0] + '.md'
            `}

            # Apply max length if specified
            content_to_save = markdown_content
            ${maxLength > 0 ? `
            if len(markdown_content) > ${maxLength}:
                content_to_save = markdown_content[:${maxLength}]
                content_to_save += f"\\n\\n... (truncated, total length: {len(markdown_content)} characters)"
            ` : ''}

            # Save markdown file
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(content_to_save)

            result["conversion"] = {
                "success": True,
                "output_path": output_path,
                "markdown_length": len(markdown_content),
                "preview": markdown_content[:500] if len(markdown_content) > 500 else markdown_content,
                "full_content": content_to_save if len(content_to_save) <= 50000 else None
            }
`;
    } else if (operation === 'extract_text') {
      pythonCode += `
            # Simple text extraction
            # Clean markdown to plain text
            text_content = markdown_content
            # Remove markdown formatting
            text_content = re.sub(r'#{1,6}\\s+', '', text_content)  # Remove headers
            text_content = re.sub(r'\\*{1,2}([^*]+)\\*{1,2}', r'\\1', text_content)  # Remove bold/italic
            text_content = re.sub(r'\\[([^\\]]+)\\]\\([^)]+\\)', r'\\1', text_content)  # Remove links
            text_content = re.sub(r'\`{1,3}[^\`]*\`{1,3}', '', text_content)  # Remove code blocks
            text_content = re.sub(r'^[\\*\\-\\+]\\s+', '', text_content, flags=re.MULTILINE)  # Remove list markers
            text_content = re.sub(r'\\n{3,}', '\\n\\n', text_content)  # Normalize line breaks

            ${maxLength > 0 ? `
            if len(text_content) > ${maxLength}:
                text_content = text_content[:${maxLength}] + "..."
            ` : ''}

            result["conversion"] = {
                "success": True,
                "markdown_length": len(markdown_content),
                "full_content": text_content
            }
`;
    } else if (operation === 'analyze_structure') {
      pythonCode += `
            # Analyze document structure
            lines = markdown_content.split('\\n')

            # Extract headings
            headings = []
            for line in lines:
                if line.startswith('#'):
                    level = len(line.split()[0])
                    heading_text = line[level:].strip()
                    if heading_text:
                        headings.append(f"{'  ' * (level-1)}{heading_text}")

            # Count various elements
            tables_count = markdown_content.count('|---')
            images_count = len(re.findall(r'!\\[.*?\\]\\(.*?\\)', markdown_content))
            lists_count = len(re.findall(r'^[\\*\\-\\+\\d]+\\.?\\s+', markdown_content, re.MULTILINE))
            code_blocks_count = len(re.findall(r'\`\`\`', markdown_content)) // 2
            paragraphs = [p.strip() for p in markdown_content.split('\\n\\n') if p.strip() and not p.strip().startswith('#')]

            result["structure"] = {
                "headings": headings[:20],  # Limit to first 20 headings
                "tables_count": tables_count,
                "images_count": images_count,
                "lists_count": lists_count,
                "code_blocks_count": code_blocks_count,
                "total_paragraphs": len(paragraphs)
            }

            result["conversion"] = {
                "success": True,
                "markdown_length": len(markdown_content),
                "preview": markdown_content[:1000] if len(markdown_content) > 1000 else markdown_content
            }
`;
    }

    // Add metadata extraction if requested
    if (includeMetadata) {
      pythonCode += `

            # Extract metadata (if available)
            metadata = {}

            # Try to extract from markdown content
            # Look for front matter or metadata section
            if markdown_content.startswith('---'):
                end_idx = markdown_content.find('---', 3)
                if end_idx > 0:
                    front_matter = markdown_content[3:end_idx]
                    for line in front_matter.split('\\n'):
                        if ':' in line:
                            key, value = line.split(':', 1)
                            metadata[key.strip().lower()] = value.strip()

            # Get file metadata
            import datetime
            file_stats = os.stat(file_path)
            metadata.update({
                "file_size": file_stats.st_size,
                "modified": datetime.datetime.fromtimestamp(file_stats.st_mtime).isoformat(),
                "created": datetime.datetime.fromtimestamp(file_stats.st_ctime).isoformat()
            })

            result["metadata"] = safe_json_value(metadata)
`;
    }

    pythonCode += `

except FileNotFoundError as e:
    result["error"] = {
        "type": "FileNotFound",
        "message": str(e),
        "details": "File does not exist or cannot be accessed"
    }
except ImportError as e:
    result["error"] = {
        "type": "DependencyError",
        "message": str(e),
        "details": "Required Python packages may not be installed. Run: pip install markitdown[pdf,docx,pptx,xlsx]"
    }
except Exception as e:
    result["error"] = {
        "type": type(e).__name__,
        "message": str(e),
        "details": "An unexpected error occurred during document processing"
    }

# Output result as JSON
print(json.dumps(result, ensure_ascii=False, indent=2))
`;

    return pythonCode;
  }

  protected parseResult(pythonOutput: string, params: MarkItDownParams): MarkItDownResult {
    try {
      const result = JSON.parse(pythonOutput) as MarkItDownResult;

      // Map Python error types to ToolErrorType
      // Note: typeof null === 'object' in JavaScript, so check !== null first
      if (result.error !== null && result.error !== undefined && typeof result.error === 'object') {
        const errorTypeMap: Record<string, ToolErrorType> = {
          'FileNotFound': ToolErrorType.FILE_NOT_FOUND,
          'DependencyError': ToolErrorType.EXECUTION_FAILED,
          'FileNotFoundError': ToolErrorType.FILE_NOT_FOUND,
          'ImportError': ToolErrorType.EXECUTION_FAILED,
          'ConversionError': ToolErrorType.EXECUTION_FAILED,
        };

        // Map the error type if it exists in our map, otherwise use UNKNOWN
        if (result.error.type) {
          const mappedType = errorTypeMap[result.error.type as string] || ToolErrorType.UNKNOWN;
          result.error.type = mappedType;
        }
      }

      // Generate helpful response based on operation
      // Note: typeof null === 'object' in JavaScript, so check !== null first
      if (result.error !== null && result.error !== undefined && typeof result.error === 'object' && result.error.message) {
        const errorMessage = result.error.message || 'Unknown error occurred';
        const errorDetails = result.error.details || '';
        result.returnDisplay = `❌ **Error:** ${errorMessage}\n\n${errorDetails}`;
        result.llmContent = `Failed to process document: ${errorMessage}`;
      } else if (params.op === 'convert') {
        const preview = result.conversion?.preview || '';
        const truncated = (result.conversion?.markdown_length || 0) > 500;

        result.returnDisplay = `✅ **Document converted successfully!**

📄 **Input:** ${result.input_file?.path}
📝 **Output:** ${result.conversion?.output_path}
📊 **Size:** ${result.conversion?.markdown_length} characters

**Preview:**
\`\`\`markdown
${preview}${truncated ? '\n...(truncated)' : ''}
\`\`\``;

        result.llmContent = result.conversion?.full_content ||
          `Document converted successfully. Output saved to ${result.conversion?.output_path}. Content length: ${result.conversion?.markdown_length} characters.`;

      } else if (params.op === 'extract_text') {
        result.returnDisplay = `✅ **Text extracted successfully!**

📄 **File:** ${result.input_file?.path}
📊 **Length:** ${result.conversion?.markdown_length} characters

**Content:**
${result.conversion?.full_content || '(no content)'}`;

        result.llmContent = result.conversion?.full_content || 'No text content extracted.';

      } else if (params.op === 'analyze_structure') {
        const structure = result.structure || {};
        result.returnDisplay = `✅ **Document structure analyzed!**

📄 **File:** ${result.input_file?.path}
📊 **Format:** ${result.input_file?.format?.toUpperCase()}

**Structure:**
- **Headings:** ${structure.headings?.length || 0}
- **Tables:** ${structure.tables_count || 0}
- **Images:** ${structure.images_count || 0}
- **Lists:** ${structure.lists_count || 0}
- **Code blocks:** ${structure.code_blocks_count || 0}
- **Paragraphs:** ${structure.total_paragraphs || 0}

${structure.headings && structure.headings.length > 0 ? `**Document Outline:**
\`\`\`
${structure.headings.join('\n')}
\`\`\`` : ''}`;

        result.llmContent = `Document structure: ${structure.headings?.length || 0} headings, ${structure.tables_count || 0} tables, ${structure.images_count || 0} images, ${structure.total_paragraphs || 0} paragraphs.`;
      }

      return result;
    } catch (error) {
      return {
        returnDisplay: `❌ **Failed to parse Python output**\n\nError: ${error}\n\nRaw output:\n\`\`\`\n${pythonOutput}\n\`\`\``,
        llmContent: `Error parsing Python output: ${error}`,
        error: {
          type: ToolErrorType.EXECUTION_FAILED,
          message: String(error),
          details: pythonOutput
        }
      };
    }
  }

}