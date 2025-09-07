/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';

interface WorkerData {
  filePath: string;
  query: string;
  pageNums: number[];  // 改为数组，让一个worker处理多个页面
  requestId: string;
}

interface MatchResult {
  text: string;
  context: string;
  index: number;
}

interface WorkerResult {
  requestId: string;
  pageResults: { pageNum: number; matches: MatchResult[] }[];  // 返回多个页面的结果
  success: boolean;
  error?: string;
}

async function searchPDFPages(): Promise<void> {
  try {
    const { filePath, query, pageNums, requestId } = workerData as WorkerData;
    
    // Load the PDF once for all pages in this batch
    const buffer = readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(buffer);
    
    const pageResults: { pageNum: number; matches: MatchResult[] }[] = [];
    
    // Process each page in this batch
    for (const pageNum of pageNums) {
      try {
        // Create a single-page PDF for individual text extraction
        const singlePageDoc = await PDFDocument.create();
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
        
        pageResults.push({ pageNum, matches });
        
      } catch (pageError) {
        // Handle individual page errors
        pageResults.push({
          pageNum,
          matches: [{
            text: query,
            context: `[Error searching page: ${pageError instanceof Error ? pageError.message : 'Unknown error'}]`,
            index: -1
          }]
        });
      }
    }
    
    // Send result back to main thread
    const result: WorkerResult = {
      requestId,
      pageResults,
      success: true
    };
    
    parentPort?.postMessage(result);
    
  } catch (error) {
    // Send error back to main thread
    const errorResult: WorkerResult = {
      requestId: (workerData as WorkerData).requestId,
      pageResults: (workerData as WorkerData).pageNums.map(pageNum => ({
        pageNum,
        matches: [{
          text: (workerData as WorkerData).query,
          context: `[Worker Error: ${error instanceof Error ? error.message : 'Unknown error'}]`,
          index: -1
        }]
      })),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    
    parentPort?.postMessage(errorResult);
  }
}

// Start processing
searchPDFPages().catch(error => {
  console.error('Worker error:', error);
});