/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
// import { createRequire } from 'node:module';
// import { pathToFileURL } from 'node:url';
import {
  BaseToolInvocation,
  Kind,
} from './tools.js';
import type { ToolResult, ToolInvocation } from './tools.js';
import { BackupableTool, type FileOperationParams } from './backupable-tool.js';

// PDF manipulation libraries
import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';
// Import PDF.js using the correct .mjs extension
// import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
// import { createCanvas } from 'canvas';

// Text extraction and parsing
interface TextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

interface FormField {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature';
  value: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageInfo {
  page: number;
  width: number;
  height: number;
  rotation: number;
  textBlocks: TextBlock[];
  images: number;
}

interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  keywords?: string[];
}

interface PDFParams extends FileOperationParams {
  /** Operation type - carefully designed for token efficiency */
  op: 'create' | 'merge' | 'split' | 'extracttext' | 'search' | 'info' | 'undo'; 
  // Commented out to save tokens: 'metadata' | 'forms' | 'protect' | 'optimize' | 'convert' | 'annotate' | 'watermark' | 'compress'
  
  // Core parameters (most common)
  /** Page numbers (1-based) or ranges like "1-3,5,7-10" */
  pages?: string;
  /** Search query for text operations */
  query?: string;
  /** Output file path */
  output?: string;
  
  // Content parameters
  /** Text content to add */
  text?: string;
  /** Position for text/elements {x, y} */
  position?: { x: number; y: number };
  /** Font size */
  fontSize?: number;
  /** Color in hex format #RRGGBB */
  color?: string;
  
  // Form parameters
  /** Form field values */
  fields?: Record<string, string>;
  /** Flatten forms after filling */
  flatten?: boolean;
  
  // Files for operations
  /** Source files for merge operations */
  sources?: string[];
  /** Image file for insertion */
  image?: string; 

}

interface MatchResult {
  text: string;
  context: string;
  index: number; // Position in the text where match was found
}

interface PDFResult extends ToolResult {
  success: boolean;
  file: string;
  op: string;
  
  // Data results
  text?: string;
  pageTexts?: Record<number, string>; // Page number -> text content
  pageSearchResults?: Record<number, MatchResult[]>; // Page number -> matches on that page
  pages?: PageInfo[];
  metadata?: PDFMetadata;
  forms?: FormField[];
  
  // File results
  outputFile?: string;
  outputFiles?: string[];
  
  // Status
  pageCount?: number;
  fileSize?: number;
  isProtected?: boolean;
}

class PDFInvocation extends BaseToolInvocation<PDFParams, PDFResult> {
  async execute(signal?: AbortSignal, liveOutputCallback?: (chunk: string) => void): Promise<PDFResult> {
    const { file, op, pages, query, output, text } = this.params;
    
    try {
      // Validate file exists for read operations
      if (['extracttext', 'search', 'info', 'split'].includes(op)) { 
        // Commented out operations: 'metadata', 'forms', 'protect', 'optimize', 'convert', 'annotate', 'watermark', 'compress'
        if (!existsSync(file)) {
          return this.createErrorResult(`PDF file not found: ${file}`);
        }
      }

      switch (op) {
        case 'create':
          return await this.createPDF(file, text || 'Hello World');
          
        case 'merge':
          return await this.mergePDFs(this.params.sources || [], output || file);
          
        case 'split':
          return await this.splitPDF(file, pages, output);
          
        case 'extracttext':
          return await this.extractText(file, pages, output);
          
        case 'search':
          if (!query || query.trim().length === 0) {
            return this.createErrorResult('Search operation requires a query parameter');
          }
          return await this.searchText(file, query, pages, liveOutputCallback, signal);
          
        case 'info':
          return await this.getPDFInfo(file, pages);                 
          
        default:
          return this.createErrorResult(`Unsupported operation: ${op}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResult(`PDF operation failed: ${message}`);
    }
  }


  private async createPDF(file: string, content: string): Promise<PDFResult> {
    try {
      const pdfDoc = new PDFDocument();
      const stream = createWriteStream(file);
      pdfDoc.pipe(stream);
      
      pdfDoc.fontSize(12).text(content, 50, 50);
      pdfDoc.end();
      
      await new Promise<void>((resolve, reject) => {
        stream.on('finish', () => resolve());
        stream.on('error', reject);
      });
      
      const stats = await fs.stat(file);
      
      return {
        success: true,
        file,
        op: 'create',
        outputFile: file,
        fileSize: stats.size,
        llmContent: `pdf(create): Created PDF "${file}" with content: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"

**File Details:**
- Path: ${file}
- Size: ${Math.round(stats.size/1024)}KB`,
        returnDisplay: `pdf(create): Successfully created PDF file`
      };
    } catch (error) {
      return this.createErrorResult(`Failed to create PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async mergePDFs(sources: string[], output: string): Promise<PDFResult> {
    try {
      const mergedDoc = await PDFLibDocument.create();
      
      for (const source of sources) {
        if (!existsSync(source)) {
          return this.createErrorResult(`Source file not found: ${source}`);
        }
        
        const sourceDoc = await PDFLibDocument.load(await fs.readFile(source), { ignoreEncryption: false });
        const pages = await mergedDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
        pages.forEach(page => mergedDoc.addPage(page));
      }
      
      await fs.writeFile(output, await mergedDoc.save());
      const stats = await fs.stat(output);
      
      return {
        success: true,
        file: output,
        op: 'merge',
        outputFile: output,
        fileSize: stats.size,
        pageCount: mergedDoc.getPageCount(),
        llmContent: `pdf(merge): Merged ${sources.length} PDFs into "${output}". Total pages: ${mergedDoc.getPageCount()}

**Source Files:**
${sources.map((source, index) => `${index + 1}. ${path.basename(source)}`).join('\n')}

**Output File:**
- Path: ${output}
- Size: ${Math.round(stats.size/1024)}KB
- Pages: ${mergedDoc.getPageCount()}`,
        returnDisplay: `pdf(merge): Successfully merged ${sources.length} PDF files`
      };
    } catch (error) {
      return this.createErrorResult(`Failed to merge PDFs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async splitPDF(file: string, pages: string | undefined, outputPath?: string): Promise<PDFResult> {
    try {
      let pdfDoc: PDFLibDocument;
      
      try {
        pdfDoc = await PDFLibDocument.load(await fs.readFile(file), { ignoreEncryption: false });
      } catch (loadError) {
        const errorMessage = loadError instanceof Error ? loadError.message : String(loadError);
        if (this.isEncryptionError(errorMessage)) {
          return this.createEncryptionErrorResult(errorMessage);
        }
        return this.createErrorResult(`Failed to load PDF: ${errorMessage}`);
      }
      const totalPages = pdfDoc.getPageCount();
      const pageNumbers = this.parsePageNumbers(pages, totalPages);
      
      // Determine base directory and filename
      let baseDir: string;
      let baseName: string;
      
      if (outputPath) {
        // Check if output is a directory or file path
        if (outputPath.endsWith('.pdf')) {
          // It's a specific file path, use it for single page only
          if (pageNumbers.length === 1) {
            baseDir = path.dirname(outputPath);
            baseName = path.basename(outputPath, '.pdf');
          } else {
            // Multiple pages, treat as directory
            baseDir = path.dirname(outputPath);
            baseName = path.basename(file, path.extname(file));
          }
        } else {
          // It's a directory
          baseDir = outputPath;
          baseName = path.basename(file, path.extname(file));
        }
      } else {
        // No output specified, use same directory as input
        baseDir = path.dirname(file);
        baseName = path.basename(file, path.extname(file));
      }
      
      const outputFiles: string[] = [];
      
      for (const pageNum of pageNumbers) {
        const newDoc = await PDFLibDocument.create();
        const [copiedPage] = await newDoc.copyPages(pdfDoc, [pageNum - 1]);
        newDoc.addPage(copiedPage);
        
        let outputFile: string;
        if (outputPath?.endsWith('.pdf') && pageNumbers.length === 1) {
          // Use the specified filename for single page
          outputFile = outputPath;
        } else {
          // Generate filename with page number
          outputFile = path.join(baseDir, `${baseName}_page_${pageNum}.pdf`);
        }
        
        await fs.writeFile(outputFile, await newDoc.save());
        outputFiles.push(outputFile);
      }
      
      return {
        success: true,
        file,
        op: 'split',
        outputFiles,
        llmContent: `pdf(split): Split "${file}" into ${outputFiles.length} files:

**Generated Files:**
${outputFiles.map((filePath, index) => `${index + 1}. ${path.basename(filePath)}
   Path: ${filePath}`).join('\n')}`,
        returnDisplay: `pdf(split): Successfully split PDF into ${outputFiles.length} files`
      };
    } catch (error) {
      return this.createErrorResult(`Failed to split PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractText(file: string, pages?: string, output?: string): Promise<PDFResult> {
    try {
      const buffer = await fs.readFile(file);
      let pdfDoc: PDFLibDocument;
      
      try {
        pdfDoc = await PDFLibDocument.load(buffer, { ignoreEncryption: false });
      } catch (loadError) {
        const errorMessage = loadError instanceof Error ? loadError.message : String(loadError);
        if (this.isEncryptionError(errorMessage)) {
          return this.createEncryptionErrorResult(errorMessage);
        }
        return this.createErrorResult(`Failed to load PDF: ${errorMessage}`);
      }
      
      const pageCount = pdfDoc.getPageCount();
      const pageNumbers = this.parsePageNumbers(pages, pageCount);
      
      const pageTexts: Record<number, string> = {};
      
      // Extract text from each specified page
      for (const pageNum of pageNumbers) {
        try {
          // Create a single-page PDF for individual parsing
          const singlePageDoc = await PDFLibDocument.create();
          const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNum - 1]);
          singlePageDoc.addPage(copiedPage);
          
          // Convert single page to buffer and extract text
          const singlePageBuffer = await singlePageDoc.save();
          const singlePageData = await pdfParse(Buffer.from(singlePageBuffer));
          
          pageTexts[pageNum] = singlePageData.text.trim() || '';
        } catch (pageError) {
          pageTexts[pageNum] = `[Error extracting page: ${pageError instanceof Error ? pageError.message : 'Unknown error'}]`;
        }
      }
      
      // Combine all text for output file
      const allText = Object.entries(pageTexts)
        .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
        .map(([pageNum, text]) => `Page ${pageNum}:\n${text}`)
        .join('\n\n');
      
      // Write to output file if specified
      let outputFile: string | undefined;
      if (output) {
        await fs.writeFile(output, allText, 'utf8');
        outputFile = output;
      }
      
      return {
        success: true,
        file,
        op: 'extracttext',
        pageTexts,
        pageCount,
        outputFile,
        text: allText,
        llmContent: `pdf(extracttext): Extracted text from ${pageNumbers.length} pages${outputFile ? ` and saved to "${outputFile}"` : ''}:
${Object.entries(pageTexts).map(([pageNum, text]) => `**Page ${pageNum}:**
${text}`).join('\n\n')}`,
        returnDisplay: `pdf(extracttext): Extracted text from ${pageNumbers.length} pages${outputFile ? ` and saved to file` : ''}`
      };
    } catch (error) {
      return this.createErrorResult(`Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async searchText(
    file: string, 
    query: string, 
    pages?: string, 
    liveOutputCallback?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<PDFResult> {
    try {
      const buffer = await fs.readFile(file);
      let pdfDoc: PDFLibDocument;
      
      try {
        pdfDoc = await PDFLibDocument.load(buffer, { ignoreEncryption: false });
      } catch (loadError) {
        const errorMessage = loadError instanceof Error ? loadError.message : String(loadError);
        
        // Check if it's an encryption-related error
        if (this.isEncryptionError(errorMessage)) {
          return this.createEncryptionErrorResult(errorMessage);
        }
        
        // For other types of errors, return the original error
        return this.createErrorResult(`Failed to load PDF: ${errorMessage}`);
      }
      
      const pageCount = pdfDoc.getPageCount();
      const pageNumbers = this.parsePageNumbers(pages, pageCount);
      
      const pageSearchResults: Record<number, MatchResult[]> = {};
      let totalMatches = 0;
      
      // Report initial progress
      if (liveOutputCallback) {
        liveOutputCallback(`Starting search for "${query}" in ${pageNumbers.length} pages...`);
      }

      // Use worker threads for better performance when processing many pages
      if (pageNumbers.length > 20) {
        console.log(`[PDF Search] Using ${Math.min(4, pageNumbers.length)} worker threads for parallel processing...`);
        return await this.searchWithWorkers(file, query, pageNumbers, liveOutputCallback, signal);
      }

      // Process pages with controlled concurrency for smaller searches
      console.log(`[PDF Search] Processing ${pageNumbers.length} pages with controlled parallelism...`);
      
      // Limit concurrent page processing to reduce memory usage
      const BATCH_SIZE = 8;
      const results: Array<{ pageNum: number; matches: MatchResult[] }> = [];
      
      for (let i = 0; i < pageNumbers.length; i += BATCH_SIZE) {
        const batch = pageNumbers.slice(i, i + BATCH_SIZE);
        
        // Check for cancellation
        if (signal?.aborted) {
          throw new Error('Search cancelled by user');
        }
        
        if (liveOutputCallback) {
          liveOutputCallback(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pageNumbers.length / BATCH_SIZE)} (pages ${batch[0]}-${batch[batch.length - 1]})`);
        }
        
        const batchPromises = batch.map(async (pageNum) => {
          try {
            // Create a single-page PDF for individual text extraction
            const singlePageDoc = await PDFLibDocument.create();
            const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNum - 1]);
            singlePageDoc.addPage(copiedPage);
            
            // Convert single page to buffer and extract text
            const singlePageBuffer = await singlePageDoc.save();
            const singlePageData = await pdfParse(Buffer.from(singlePageBuffer));
            const pageText = singlePageData.text;
            
            // Search for all occurrences of query in this page
            const matches: MatchResult[] = [];
            const queryLower = query.toLowerCase();
            const textLower = pageText.toLowerCase();
            
            let searchIndex = 0;
            while (searchIndex < textLower.length) {
              const matchIndex = textLower.indexOf(queryLower, searchIndex);
              if (matchIndex === -1) break;
              
              // Extract context around the match (50 characters before and after)
              const contextStart = Math.max(0, matchIndex - 50);
              const contextEnd = Math.min(pageText.length, matchIndex + query.length + 50);
              const context = pageText.substring(contextStart, contextEnd).trim();
              
              matches.push({
                text: pageText.substring(matchIndex, matchIndex + query.length),
                context: context.length > 150 ? context.substring(0, 147) + '...' : context,
                index: matchIndex
              });
              
              searchIndex = matchIndex + 1;
            }
            
            return { pageNum, matches };
          } catch (pageError) {
            return {
              pageNum,
              matches: [{
                text: query,
                context: `[Error searching page: ${pageError instanceof Error ? pageError.message : 'Unknown error'}]`,
                index: -1
              }]
            };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Report progress after each batch
        if (liveOutputCallback) {
          const progress = Math.round(((i + batch.length) / pageNumbers.length) * 100);
          liveOutputCallback(`Completed ${i + batch.length}/${pageNumbers.length} pages (${progress}%)`);
        }
      }
      
      // Collect results from all batches
      for (const { pageNum, matches } of results) {
        pageSearchResults[pageNum] = matches;
        totalMatches += matches.length;
      }
      
      // Report completion
      if (liveOutputCallback) {
        liveOutputCallback(`Search completed! Found ${totalMatches} matches total.`);
      }
      
      return {
        success: true,
        file,
        op: 'search',
        pageSearchResults,
        pageCount,
        llmContent: this.formatSearchResults(query, totalMatches, pageSearchResults, pageCount, false),
        returnDisplay: `pdf(search): Found ${totalMatches} matches for "${query}" ${pages ? `in pages ${pages}` : `across entire PDF`}`
      };
    } catch (error) {
      return this.createErrorResult(`Failed to search PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async searchWithWorkers(
    file: string,
    query: string,
    pageNumbers: number[],
    liveOutputCallback?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<PDFResult> {
    const pageSearchResults: Record<number, MatchResult[]> = {};
    let totalMatches = 0;
    const pageCount = pageNumbers.length;
    
    try {
      // Get current directory for worker script (compiled .js file)  
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const workerScript = path.join(__dirname, 'pdf-search-worker.js');
      
      // Check if worker file exists - if not, fall back gracefully
      if (!existsSync(workerScript)) {
        console.warn(`[PDF Search] Worker script not found: ${workerScript}, falling back to async processing`);
        if (liveOutputCallback) {
          liveOutputCallback(`Worker not available, using regular async processing for ${pageNumbers.length} pages...`);
        }
        // Fall back to regular batch processing
        throw new Error('Worker not available');
      }
      
      // Limit concurrent workers to avoid overwhelming system
      const maxWorkers = Math.min(4, pageNumbers.length);
      const batches: number[][] = [];
      
      // Split pages into batches for worker processing
      for (let i = 0; i < pageNumbers.length; i += Math.ceil(pageNumbers.length / maxWorkers)) {
        batches.push(pageNumbers.slice(i, i + Math.ceil(pageNumbers.length / maxWorkers)));
      }
      
      if (liveOutputCallback) {
        liveOutputCallback(`Starting ${batches.length} worker threads for ${pageNumbers.length} pages...`);
      }
      
      const workerPromises = batches.map((batch, batchIndex) => 
        new Promise<Array<{ pageNum: number; matches: MatchResult[] }>>((resolve, reject) => {
          if (signal?.aborted) {
            reject(new Error('Search cancelled by user'));
            return;
          }
          
          // Create one worker per batch, pass all pages in the batch
          const worker = new Worker(workerScript, {
            workerData: {
              filePath: file,
              query,
              pageNums: batch,  // 传递整个batch的页面数组
              requestId: `batch-${batchIndex}`
            }
          });
          
          worker.on('message', (result) => {
            // Worker now returns pageResults array with all pages processed
            const results = result.pageResults;
            
            if (liveOutputCallback) {
              const totalProcessed = (batchIndex + 1) * batch.length;
              const overallProgress = Math.round(Math.min(totalProcessed, pageNumbers.length) / pageNumbers.length * 100);
              liveOutputCallback(`Worker ${batchIndex + 1}: Completed ${batch.length} pages (${overallProgress}%)`);
            }
            
            resolve(results);
            worker.terminate();
          });
          
          worker.on('error', (error) => {
            // Create error results for all pages in this batch
            const errorResults = batch.map(pageNum => ({
              pageNum,
              matches: [{
                text: query,
                context: `[Worker Error: ${error.message}]`,
                index: -1
              }]
            }));
            
            resolve(errorResults);
            worker.terminate();
          });
        })
      );
      
      // Wait for all worker batches to complete
      const batchResults = await Promise.all(workerPromises);
      
      // Flatten and collect results
      for (const batchResult of batchResults) {
        for (const { pageNum, matches } of batchResult) {
          pageSearchResults[pageNum] = matches;
          totalMatches += matches.length;
        }
      }
      
      if (liveOutputCallback) {
        liveOutputCallback(`Multi-threaded search completed! Found ${totalMatches} matches total.`);
      }
      
      return {
        success: true,
        file,
        op: 'search',
        pageSearchResults,
        pageCount,
        llmContent: this.formatSearchResults(query, totalMatches, pageSearchResults, pageCount, true, batches.length),
        returnDisplay: `pdf(search): Found ${totalMatches} matches for "${query}" across entire PDF using multi-threading`
      };
      
    } catch (error) {
      return this.createErrorResult(`Multi-threaded search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatSearchResults(
    query: string, 
    totalMatches: number, 
    pageSearchResults: Record<number, MatchResult[]>,
    pageCount: number,
    isMultiThreaded: boolean = false,
    workerCount?: number
  ): string {
    // Check for errors in results
    const errorPages = Object.entries(pageSearchResults).filter(([, matches]) => 
      matches.some(match => match.context.startsWith('[Worker Error:') || match.context.startsWith('[Error'))
    );
    
    // If there are many errors, summarize instead of listing all
    if (errorPages.length > 3) {
      const successfulPages = Object.keys(pageSearchResults).length - errorPages.length;
      const actualMatches = totalMatches - errorPages.length; // Subtract error entries
      
      return `pdf(search): ${isMultiThreaded ? `Multi-threaded search using ${workerCount} workers` : 'Search'} completed with issues.

**Summary:**
- Successfully searched: ${successfulPages} pages
- Actual matches found: ${actualMatches}
- Pages with errors: ${errorPages.length}

${actualMatches > 0 ? `**Valid Results:**
${Object.entries(pageSearchResults)
  .filter(([, matches]) => matches.length > 0 && !matches.some(m => m.context.startsWith('[')))
  .map(([pageNum, matches]) => `- Page ${pageNum}: ${matches.length} matches`)
  .join('\n')}` : ''}

${errorPages.length > 0 ? `\n**Note:** ${errorPages.length} pages encountered processing errors and were skipped.` : ''}`;
    }
    
    // Normal output for successful searches or few errors
    const methodInfo = isMultiThreaded ? ` using ${workerCount} worker threads` : '';
    const scopeInfo = `across entire PDF (${pageCount} pages)`;
    
    return `pdf(search): Found ${totalMatches} matches for "${query}" ${scopeInfo}${methodInfo}:

${Object.entries(pageSearchResults)
  .filter(([, matches]) => matches.length > 0)
  .map(([pageNum, matches]) => {
    // Filter out error entries for cleaner display  
    const validMatches = matches.filter(match => !match.context.startsWith('['));
    if (validMatches.length === 0) return null;
    
    return `**Page ${pageNum} (${validMatches.length} matches):**
${validMatches.map(match => `- "${match.text}" (context: ${match.context})`).join('\n')}`;
  })
  .filter(Boolean)
  .join('\n\n') || 'No matches found'}

${totalMatches === 0 ? `The text "${query}" was not found in the searched pages.` : ''}`;
  }

  private async getPDFInfo(file: string, pages?: string): Promise<PDFResult> {
    try {
      let pdfDoc: PDFLibDocument;
      
      try {
        pdfDoc = await PDFLibDocument.load(await fs.readFile(file), { ignoreEncryption: false });
      } catch (loadError) {
        const errorMessage = loadError instanceof Error ? loadError.message : String(loadError);
        if (this.isEncryptionError(errorMessage)) {
          return this.createEncryptionErrorResult(errorMessage);
        }
        return this.createErrorResult(`Failed to load PDF: ${errorMessage}`);
      }
      const pageCount = pdfDoc.getPageCount();
      const stats = await fs.stat(file);
      const pageNumbers = this.parsePageNumbers(pages, pageCount);
      
      // Get basic metadata and decode hex strings
      const decodeMetadataValue = (value: string | undefined): string | undefined => {
        if (!value) return undefined;
        
        // Check if value is a hex string wrapped in angle brackets
        if (value.startsWith('<') && value.endsWith('>')) {
          const hexString = value.slice(1, -1);
          // Validate hex string format
          if (/^[0-9A-Fa-f]+$/.test(hexString) && hexString.length % 2 === 0) {
            try {
              // Convert hex to bytes and decode as UTF-8
              const bytes: number[] = [];
              for (let i = 0; i < hexString.length; i += 2) {
                bytes.push(parseInt(hexString.substr(i, 2), 16));
              }
              const buffer = Buffer.from(bytes);
              
              // Try different encodings
              let decoded = '';
              
              // Try UTF-8 first
              try {
                decoded = buffer.toString('utf8');
                // Check if decoded contains replacement characters indicating encoding issues
                if (!decoded.includes('\uFFFD')) {
                  return decoded;
                }
              } catch {
                // Continue to next encoding
              }
              
              // Try UTF-16LE
              try {
                decoded = buffer.toString('utf16le');
                if (!decoded.includes('\uFFFD') && decoded.length > 0) {
                  return decoded;
                }
              } catch {
                // Continue to next encoding
              }
              
              // Try Latin1 for legacy encodings
              try {
                decoded = buffer.toString('latin1');
                if (decoded.length > 0) {
                  return decoded;
                }
              } catch {
                // Continue to fallback
              }
              
              // Final fallback to ASCII
              try {
                return buffer.toString('ascii');
              } catch {
                return value; // Return original if all fail
              }
            } catch {
              // If decoding fails, return original value
              return value;
            }
          }
        }
        
        return value;
      };
      
      const rawTitle = pdfDoc.getTitle();
      const rawAuthor = pdfDoc.getAuthor();
      const rawSubject = pdfDoc.getSubject();
      const rawCreator = pdfDoc.getCreator();
      const rawProducer = pdfDoc.getProducer();
      
      const metadata: PDFMetadata = {
        title: decodeMetadataValue(rawTitle),
        author: decodeMetadataValue(rawAuthor),
        subject: decodeMetadataValue(rawSubject),
        creator: decodeMetadataValue(rawCreator),
        producer: decodeMetadataValue(rawProducer),
      };
      
      // Get page structure information
      const pagesInfo: PageInfo[] = [];
      const pageSizeGroups = new Map<string, { size: string; rotation: number; pages: number[] }>();
      
      for (const pageNum of pageNumbers) {
        const page = pdfDoc.getPage(pageNum - 1);
        const { width, height } = page.getSize();
        const rotation = page.getRotation().angle;
        
        // Group pages with same dimensions and rotation
        const sizeKey = `${width}x${height}${rotation ? `_rot${rotation}` : ''}`;
        if (!pageSizeGroups.has(sizeKey)) {
          pageSizeGroups.set(sizeKey, {
            size: `${width} x ${height} points${rotation ? ` (rotated ${rotation}°)` : ''}`,
            rotation,
            pages: []
          });
        }
        pageSizeGroups.get(sizeKey)!.pages.push(pageNum);
        
        pagesInfo.push({
          page: pageNum,
          width,
          height,
          rotation,
          textBlocks: [], // Would require OCR library for full implementation
          images: 0 // Would require image extraction
        });
      }
      
      // Create optimized page structure display
      const pageStructureDisplay = Array.from(pageSizeGroups.entries())
        .map(([, group]) => {
          const pageList = group.pages.length === 1 
            ? `Page ${group.pages[0]}`
            : group.pages.length <= 5
              ? `Pages ${group.pages.join(', ')}`
              : `Pages ${group.pages[0]}-${group.pages[group.pages.length - 1]} (${group.pages.length} pages)`;
          return `${pageList}: ${group.size}`;
        })
        .join('\n');
      
      return {
        success: true,
        file,
        op: 'info',
        pageCount,
        fileSize: stats.size,
        metadata,
        pages: pagesInfo,
        isProtected: false, // Would need to check encryption
        llmContent: `pdf(info): PDF "${file}" has ${pageCount} pages, size: ${Math.round(stats.size/1024)}KB

**Metadata:**
${Object.entries(metadata)
  .filter(([, value]) => value !== undefined)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join('\n') || 'No metadata available'}

**Page Structure:**
${pageStructureDisplay}`,
        returnDisplay: `pdf(info): PDF has ${pageCount} pages, size: ${Math.round(stats.size/1024)}KB`
      };
    } catch (error) {
      return this.createErrorResult(`Failed to get PDF info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parsePageNumbers(pages: string | undefined, totalPages: number): number[] {
    if (!pages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    const result: number[] = [];
    const parts = pages.split(',');
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map(n => parseInt(n.trim(), 10));
        for (let i = start; i <= Math.min(end, totalPages); i++) {
          if (i >= 1) result.push(i);
        }
      } else {
        const pageNum = parseInt(trimmed, 10);
        if (pageNum >= 1 && pageNum <= totalPages) {
          result.push(pageNum);
        }
      }
    }
    
    return [...new Set(result)].sort((a, b) => a - b);
  }

  private createErrorResult(message: string): PDFResult {
    return {
      success: false,
      file: this.params.file,
      op: this.params.op,
      llmContent: `pdf(${this.params.op}): ${message}`,
      returnDisplay: `pdf(${this.params.op}): ${message}`,
    };
  }

  private isEncryptionError(errorMessage: string): boolean {
    return errorMessage.includes('encrypted') || 
           errorMessage.includes('Invalid object ref') || 
           errorMessage.includes('Expected instance of PDFDict') ||
           errorMessage.includes('Trying to parse invalid object') ||
           errorMessage.includes('password') ||
           errorMessage.includes('security');
  }

  private createEncryptionErrorResult(errorMessage: string): PDFResult {
    return this.createErrorResult(
      `PDF appears to be encrypted or password-protected. The file cannot be processed because:\n` +
      `• The PDF may require a password to access its content\n` +
      `• The encryption method may not be supported by the PDF processor\n` +
      `• The PDF structure may be corrupted due to encryption issues\n\n` +
      `Technical details: ${errorMessage}\n\n` +
      `Suggestions:\n` +
      `• Try removing password protection from the PDF using another tool\n` +
      `• Use a different PDF processor that supports this encryption method\n` +
      `• Contact the PDF creator for an unencrypted version`
    );
  }

  getDescription(): string {
    const { op, file, pages, query, output } = this.params;
    
    switch (op) {
      case 'create':
        return `Creating PDF "${file}"`;
      case 'merge':
        return `Merging PDFs into "${output || file}"`;
      case 'split':
        return `Splitting PDF "${file}"${pages ? ` pages ${pages}` : ''}`;
      case 'extracttext':
        return `Extracting text from PDF "${file}"${pages ? ` pages ${pages}` : ''}`;
      case 'search':
        return `Searching for "${query}" in PDF "${file}"${pages ? ` pages ${pages}` : ' (all pages)'}`;
      case 'info':
        return `Getting info and structure for PDF "${file}"${pages ? ` pages ${pages}` : ''}`;

      default:
        return `Performing ${op} operation on PDF "${file}"`;
    }
  }
}

export class PDFTool extends BackupableTool<PDFParams, PDFResult> {
  constructor() {
    super(
      'pdf',
      'PDF Operations',
      'PDF operations: create/merge PDFs, SPLIT pages into separate PDF files, extracttext to get text from pages, SEARCH text across entire PDF (pages optional), info for PDF metadata.',
      Kind.Other,
      {
        type: 'object',
        required: ['file', 'op'],
        properties: {
          file: { type: 'string', description: 'PDF file path' },
          op: {
            type: 'string',
            enum: ['create', 'merge', 'split', 'extracttext', 'search', 'info', 'undo'], 
            description: 'Operation: split=save pages as PDF files, extracttext=get text content (use output param to save to file), search=find text in entire PDF, info=get PDF info' // , toimage=convert PDF pages to PNG images for visual analysis
          },
          pages: { type: 'string', description: 'OPTIONAL page numbers/ranges (1-based): "1-3,5,7-10". If not specified, processes ALL pages' },
          query: { type: 'string', description: 'Search text query (REQUIRED for search operation)' },
          output: { type: 'string', description: 'Output file path (for extracttext: saves text to file; for split/create: output PDF file)' },
          text: { type: 'string', description: 'Text content to add' },
          position: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            },
            description: 'Position coordinates {x, y}'
          },
          fontSize: { type: 'number', description: 'Font size for text' },
          color: { type: 'string', description: 'Color in hex format #RRGGBB' },
          fields: {
            type: 'object',
            description: 'Form field values as key-value pairs'
          },
          flatten: { type: 'boolean', description: 'Flatten forms after filling' },
          sources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Source PDF files for merge operation'
          },          
        }
      }
    );
  }

  /**
   * Identify which operations modify PDF files
   */
  protected isModifyOperation(params: PDFParams): boolean {
    const modifyOps = ['create', 'merge', 'split'];
    return modifyOps.includes(params.op);
  }

  /**
   * Get the target file path for the operation
   */
  protected getTargetFilePath(params: PDFParams): string | null {
    // For split and merge, the main file is the target
    // For create, output is the target but we backup if file exists
    if (params.op === 'create' && params.output) {
      return params.output;
    }
    return params.file;
  }

  /**
   * Create the original tool invocation
   */
  protected createOriginalInvocation(params: PDFParams): ToolInvocation<PDFParams, PDFResult> {
    return new PDFInvocation(params);
  }
}