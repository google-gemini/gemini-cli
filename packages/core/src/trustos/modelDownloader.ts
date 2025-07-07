/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { createWriteStream } from 'fs';
import { URL } from 'url';
import { TrustModelConfig } from './types.js';

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
  speed: number; // bytes per second
  eta: number; // estimated time remaining in seconds
}

export class ModelDownloader {
  private downloadDir: string;

  constructor(downloadDir: string) {
    this.downloadDir = downloadDir;
  }

  async downloadModel(
    model: TrustModelConfig,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<string> {
    if (!model.downloadUrl) {
      throw new Error(`No download URL provided for model ${model.name}`);
    }

    // Ensure download directory exists
    await fs.mkdir(this.downloadDir, { recursive: true });

    const fileName = path.basename(model.path);
    const tempPath = path.join(this.downloadDir, `${fileName}.tmp`);
    const finalPath = path.join(this.downloadDir, fileName);

    console.log(`\n📥 Downloading ${model.name}`);
    console.log(`📂 Saving to: ${finalPath}`);
    console.log(`🔗 From: ${model.downloadUrl}`);

    try {
      // Check if file already exists and is valid
      try {
        const stats = await fs.stat(finalPath);
        if (stats.size > 0) {
          console.log(`✅ Model ${model.name} already exists and is valid`);
          return finalPath;
        }
      } catch {
        // File doesn't exist, proceed with download
      }

      // For now, create a placeholder implementation
      // In production, this would download from Hugging Face
      const isHuggingFaceUrl = model.downloadUrl.includes('huggingface.co');
      
      if (isHuggingFaceUrl) {
        return await this.downloadFromHuggingFace(model, tempPath, finalPath, onProgress);
      } else {
        return await this.downloadFromUrl(model.downloadUrl, tempPath, finalPath, onProgress);
      }

    } catch (error) {
      // Clean up temp file on error
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  private async downloadFromHuggingFace(
    model: TrustModelConfig,
    tempPath: string,
    finalPath: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<string> {
    // Convert Hugging Face blob URL to direct download URL
    const downloadUrl = this.getHuggingFaceDownloadUrl(model.downloadUrl!);
    
    console.log(`🚀 Starting download of ${model.name}...`);
    
    return new Promise((resolve, reject) => {
      const file = createWriteStream(tempPath);
      const startTime = Date.now();
      let downloaded = 0;

      const options = {
        headers: {
          'User-Agent': 'TrustCLI/0.1.0 (https://github.com/audit-brands/trust-cli)',
          'Accept': '*/*',
          'Accept-Encoding': 'identity'
        }
      };

      this.makeRequest(downloadUrl, options, file, tempPath, finalPath, startTime, onProgress, resolve, reject);
    });
  }

  private makeRequest(
    url: string,
    options: any,
    file: any,
    tempPath: string,
    finalPath: string,
    startTime: number,
    onProgress?: (progress: DownloadProgress) => void,
    resolve?: (value: string) => void,
    reject?: (reason: any) => void
  ) {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const request = client.get(url, options, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          // Handle relative URLs by resolving against the original URL
          const absoluteRedirectUrl = redirectUrl.startsWith('http') 
            ? redirectUrl 
            : new URL(redirectUrl, url).toString();
          
          // Make recursive call with redirect URL
          this.makeRequest(absoluteRedirectUrl, options, file, tempPath, finalPath, startTime, onProgress, resolve, reject);
          return;
        }
      }

      this.handleDownloadResponse(response, file, tempPath, finalPath, startTime, onProgress, resolve, reject);
    });

    request.on('error', (error) => {
      file.close();
      fs.unlink(tempPath).catch(() => {}); // Clean up temp file
      reject?.(error);
    });
  }

  private handleDownloadResponse(
    response: any,
    file: any,
    tempPath: string,
    finalPath: string,
    startTime: number,
    onProgress?: (progress: DownloadProgress) => void,
    resolve?: (value: string) => void,
    reject?: (reason: any) => void
  ) {
    const total = parseInt(response.headers['content-length'] || '0', 10);
    let downloaded = 0;

    if (response.statusCode !== 200) {
      file.close();
      fs.unlink(tempPath).catch(() => {});
      reject?.(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      return;
    }

    response.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      
      if (onProgress && total > 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = downloaded / elapsed;
        const eta = (total - downloaded) / speed;
        
        onProgress({
          downloaded,
          total,
          percentage: (downloaded / total) * 100,
          speed,
          eta
        });
      }
    });

    response.pipe(file);

    file.on('finish', async () => {
      file.close();
      try {
        await fs.rename(tempPath, finalPath);
        console.log(`\n✅ Successfully downloaded ${finalPath.split('/').pop()}`);
        console.log(`📁 Location: ${finalPath}`);
        console.log(`📊 Size: ${this.formatFileSize(downloaded)}`);
        resolve?.(finalPath);
      } catch (error) {
        reject?.(error);
      }
    });

    file.on('error', (error: Error) => {
      fs.unlink(tempPath).catch(() => {});
      reject?.(error);
    });
  }

  private getHuggingFaceDownloadUrl(blobUrl: string): string {
    // Convert from blob URL to direct download URL
    // Example: https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/blob/main/qwen2.5-1.5b-instruct-q8_0.gguf
    // To: https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q8_0.gguf?download=true
    
    if (blobUrl.includes('/blob/')) {
      return blobUrl.replace('/blob/', '/resolve/') + '?download=true';
    }
    
    // If it's already a resolve URL, just add download parameter
    if (blobUrl.includes('/resolve/')) {
      return blobUrl.includes('?') ? blobUrl + '&download=true' : blobUrl + '?download=true';
    }
    
    return blobUrl;
  }

  private async downloadFromUrl(
    url: string,
    tempPath: string,
    finalPath: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(tempPath);
      const startTime = Date.now();
      let downloaded = 0;

      https.get(url, (response) => {
        const total = parseInt(response.headers['content-length'] || '0', 10);

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          
          if (onProgress && total > 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = downloaded / elapsed;
            const eta = (total - downloaded) / speed;
            
            onProgress({
              downloaded,
              total,
              percentage: (downloaded / total) * 100,
              speed,
              eta
            });
          }
        });

        response.pipe(file);

        file.on('finish', async () => {
          file.close();
          try {
            await fs.rename(tempPath, finalPath);
            resolve(finalPath);
          } catch (error) {
            reject(error);
          }
        });

        file.on('error', (error) => {
          fs.unlink(tempPath);
          reject(error);
        });

      }).on('error', (error) => {
        fs.unlink(tempPath);
        reject(error);
      });
    });
  }

  private getEstimatedModelSize(model: TrustModelConfig): number {
    // Estimate model size based on parameters and quantization
    const parameterCount = this.parseParameterCount(model.parameters || '1B');
    
    let bytesPerParam: number;
    switch (model.quantization) {
      case 'Q4_K_M':
      case 'Q4_0':
        bytesPerParam = 0.5; // 4-bit quantization
        break;
      case 'Q8_0':
        bytesPerParam = 1; // 8-bit quantization
        break;
      case 'FP16':
        bytesPerParam = 2; // 16-bit floating point
        break;
      case 'Q5_K_M':
        bytesPerParam = 0.625; // 5-bit quantization
        break;
      default:
        bytesPerParam = 1;
    }
    
    // Add overhead for model structure
    return Math.floor(parameterCount * bytesPerParam * 1.1);
  }

  private parseParameterCount(paramString: string): number {
    const match = paramString.match(/^(\d+(?:\.\d+)?)([BMK])$/i);
    if (!match) return 1_000_000_000; // Default 1B
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    switch (unit) {
      case 'K': return value * 1_000;
      case 'M': return value * 1_000_000;
      case 'B': return value * 1_000_000_000;
      default: return value;
    }
  }


  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  static formatSpeed(bytesPerSecond: number): string {
    return new ModelDownloader('').formatFileSize(bytesPerSecond) + '/s';
  }

  static formatETA(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.round((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }
}