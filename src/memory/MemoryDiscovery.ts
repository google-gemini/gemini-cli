import * as fs from 'fs';
import * as path from 'path';

export class MemoryDiscovery {
    // ...existing code...

    private async readGeminiFile(filePath: string): Promise<string | null> {
        try {
            // Check if path exists and is a file (not a directory)
            const stats = await fs.promises.stat(filePath);
            if (stats.isDirectory()) {
                console.warn(`[WARN] [MemoryDiscovery] Skipping ${filePath}: is a directory, expected a file`);
                return null;
            }
            
            const content = await fs.promises.readFile(filePath, 'utf8');
            return content;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, this is expected behavior
                return null;
            } else {
                console.warn(`[WARN] [MemoryDiscovery] Warning: Could not read GEMINI.md file at ${filePath}. Error: ${error.message}`);
                return null;
            }
        }
    }

    private async discoverGeminiFiles(): Promise<void> {
        const searchPaths = this.getSearchPaths();
        
        for (const searchPath of searchPaths) {
            const geminiPath = path.join(searchPath, 'GEMINI.md');
            const result = await this.readGeminiFile(geminiPath);
            // ...existing code...
        }
    }

    // ...existing code...
}