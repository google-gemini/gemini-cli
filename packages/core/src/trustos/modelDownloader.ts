/**
 * @license
 * Copyright 2025 Trust Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as https from 'https';
import { createWriteStream } from 'fs';
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
    // For this demo implementation, we'll create a placeholder file
    // In production, this would use the Hugging Face Hub API or direct download
    
    console.log(`🚧 Demo Mode: Creating placeholder file for ${model.name}`);
    console.log(`📝 In production, this would download from: ${model.downloadUrl}`);
    
    // Simulate download progress
    const simulatedSize = this.getEstimatedModelSize(model);
    const chunkSize = 1024 * 1024; // 1MB chunks
    let downloaded = 0;
    const startTime = Date.now();
    
    // Create placeholder content
    const placeholderContent = this.createPlaceholderContent(model);
    
    // Write in chunks to simulate download
    const writeStream = createWriteStream(tempPath);
    
    return new Promise((resolve, reject) => {
      const writeChunk = () => {
        if (downloaded >= simulatedSize) {
          writeStream.end();
          return;
        }
        
        const remainingSize = simulatedSize - downloaded;
        const currentChunkSize = Math.min(chunkSize, remainingSize);
        const chunk = Buffer.alloc(currentChunkSize, placeholderContent);
        
        writeStream.write(chunk);
        downloaded += currentChunkSize;
        
        if (onProgress) {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = downloaded / elapsed;
          const eta = (simulatedSize - downloaded) / speed;
          
          onProgress({
            downloaded,
            total: simulatedSize,
            percentage: (downloaded / simulatedSize) * 100,
            speed,
            eta
          });
        }
        
        // Simulate network delay
        setTimeout(writeChunk, 10);
      };
      
      writeStream.on('error', reject);
      writeStream.on('finish', async () => {
        try {
          // Move temp file to final location
          await fs.rename(tempPath, finalPath);
          console.log(`\n✅ Successfully downloaded ${model.name}`);
          console.log(`📁 Saved to: ${finalPath}`);
          console.log(`📊 Size: ${this.formatFileSize(downloaded)}`);
          resolve(finalPath);
        } catch (error) {
          reject(error);
        }
      });
      
      writeChunk();
    });
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

  private createPlaceholderContent(model: TrustModelConfig): string {
    return `# Trust Model Placeholder: ${model.name}\n` +
           `# This is a placeholder file created in demo mode.\n` +
           `# In production, this would be the actual GGUF model file.\n` +
           `# Model: ${model.description}\n` +
           `# Type: ${model.type}\n` +
           `# Quantization: ${model.quantization}\n` +
           `# Parameters: ${model.parameters}\n` +
           `# Original URL: ${model.downloadUrl}\n` +
           `# Trust Score: ${model.trustScore}/10\n\n`;
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