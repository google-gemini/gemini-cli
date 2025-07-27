import * as fs from 'fs';
import * as path from 'path';

export class MemoryDiscovery {
    // ...existing code...

    private async readGeminiFile(filePath: string): Promise<string | null> {
        try {
            // Attempt to read the file directly. This is more efficient than stat + read.
            const content = await fs.promises.readFile(filePath, 'utf8');
            return content;
        } catch (error: unknown) {
            // Check if it's a Node.js file system error.
            if (error instanceof Error && 'code' in error) {
                if ((error as any).code === 'ENOENT') {
                    // File doesn't exist, which is an expected and valid case.
                    return null;
                }
                if ((error as any).code === 'EISDIR') {
                    // Path is a directory, not a file. Log a warning and skip.
                    console.warn(`[WARN] [MemoryDiscovery] Skipping ${filePath}: is a directory, expected a file`);
                    return null;
                }
            }
            
            // For all other errors, log a generic warning.
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[WARN] [MemoryDiscovery] Warning: Could not read GEMINI.md file at ${filePath}. Error: ${message}`);
            return null;
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