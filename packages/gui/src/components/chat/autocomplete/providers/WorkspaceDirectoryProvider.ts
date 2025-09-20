import {
  Folder, FolderOpen, File, FileText, FileCode, FileImage, FileVideo, FileAudio, FileArchive,
  FileSpreadsheet, FileType, FileCheck, Database, Presentation, Mail, Calculator
} from 'lucide-react';
import type { AutocompleteProvider, AutocompleteItem } from '../types';
import { multiModelService } from '@/services/multiModelService';

export class WorkspaceDirectoryProvider implements AutocompleteProvider {
  trigger = '@';
  name = 'Workspace Directories';
  description = 'Reference workspace directories and files';

  private cachedItems: AutocompleteItem[] = [];
  private lastCacheTime = 0;
  private cacheTimeout = 5000; // 5 seconds for more responsive updates
  private isLoading = false;
  private filterMode: 'all' | 'folders' | 'files' = 'all';

  async getItems(query: string): Promise<AutocompleteItem[]> {
    await this.refreshCacheIfNeeded();

    // Filter based on current filter mode
    let filteredItems = this.cachedItems.filter(item => {
      switch (this.filterMode) {
        case 'folders':
          // Show only folders and workspace directories
          return item.type === 'workspace' || item.type === 'folder';
        case 'files':
          // Show only files
          return item.type === 'file';
        case 'all':
        default:
          // Show everything
          return true;
      }
    });

    // Filter based on query
    if (query) {
      const lowercaseQuery = query.toLowerCase();
      filteredItems = filteredItems.filter(item =>
        item.label.toLowerCase().includes(lowercaseQuery) ||
        item.value.toLowerCase().includes(lowercaseQuery) ||
        item.description?.toLowerCase().includes(lowercaseQuery)
      );
    }

    // Sort: workspaces first, then folders, then files
    filteredItems.sort((a, b) => {
      const typeOrder = { workspace: 0, folder: 1, file: 2 };
      const aOrder = typeOrder[a.type || 'file'];
      const bOrder = typeOrder[b.type || 'file'];
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.label.localeCompare(b.label);
    });

    return filteredItems.slice(0, 30);
  }

  setFilterMode(mode: 'all' | 'folders' | 'files'): void {
    this.filterMode = mode;
  }

  getFilterMode(): 'all' | 'folders' | 'files' {
    return this.filterMode;
  }

  private async refreshCacheIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheTime < this.cacheTimeout && this.cachedItems.length > 0) {
      return;
    }

    // Prevent multiple concurrent refreshes
    if (this.isLoading) {
      return;
    }

    this.isLoading = true;

    try {
      // Get workspace directories from multiModelService
      const workspaceDirectories = await multiModelService.getWorkspaceDirectories();

      this.cachedItems = [];

      // Add workspace directories and their first-level contents
      for (const [index, dir] of workspaceDirectories.entries()) {
        const displayName = this.getDisplayName(dir);
        const isCurrentDir = this.isCurrentDirectory(dir);

        // Add the workspace directory itself
        this.cachedItems.push({
          id: `workspace-${index}`,
          label: displayName,
          value: this.normalizePathForInsert(dir),
          description: isCurrentDir ? 'Active workspace directory' : 'Workspace directory',
          icon: isCurrentDir ? FolderOpen : Folder,
          type: 'workspace',
          category: 'workspace',
          level: 0 // Root level
        });

        // Fetch first-level files and folders
        try {
          const items = await this.getFirstLevelItems(dir);
          this.cachedItems.push(...items);
        } catch (error) {
          console.warn(`Failed to load items for ${dir}:`, error);
        }
      }

      this.lastCacheTime = now;
    } catch (error) {
      console.warn('Failed to load workspace directories:', error);

      // Fallback: empty list if workspace directories are not available
      this.cachedItems = [];
    } finally {
      this.isLoading = false;
    }
  }

  private getDisplayName(path: string): string {
    const parts = path.replace(/\\/g, '/').split('/');
    const name = parts[parts.length - 1] || path;

    // Show more context for common directory names
    if (name === 'src' || name === 'lib' || name === 'dist' || name === 'build') {
      const parent = parts[parts.length - 2];
      return parent ? `${name} (${parent})` : name;
    }

    return name;
  }

  private isCurrentDirectory(path: string): boolean {
    try {
      if (typeof process === 'undefined' || !process.cwd) return false;
      const currentDir = process.cwd();
      const normalizedPath = path.replace(/\\/g, '/');
      const normalizedCurrent = currentDir.replace(/\\/g, '/');
      return normalizedPath === normalizedCurrent;
    } catch {
      return false;
    }
  }

  private normalizePathForInsert(path: string): string {
    // Convert backslashes to forward slashes for consistency
    let normalized = path.replace(/\\/g, '/');

    // Add trailing slash for directories if not present
    if (!normalized.endsWith('/')) {
      normalized += '/';
    }

    return normalized;
  }

  // Method to manually refresh cache
  async refreshCache(): Promise<void> {
    this.lastCacheTime = 0;
    await this.refreshCacheIfNeeded();
  }

  private async getFirstLevelItems(directory: string): Promise<AutocompleteItem[]> {
    const items: AutocompleteItem[] = [];

    try {
      // Use the backend API to get directory contents
      const contents = await multiModelService.getDirectoryContents(directory);

      for (const item of contents) {
        const displayName = item.name;
        const fullPath = this.normalizePathForInsert(item.path);

        items.push({
          id: `${directory}-${item.name}`,
          label: `├─ ${displayName}`, // Add tree structure indicator
          value: fullPath,
          description: item.type === 'folder' ? 'Subfolder' : this.formatFileSize(item.size || 0),
          icon: item.type === 'folder' ? Folder : this.getFileIcon(item.name),
          type: item.type,
          size: item.size,
          modified: item.modified,
          level: 1 // Sub-level
        });
      }
    } catch (error) {
      console.warn(`Failed to load items for ${directory}:`, error);
    }

    return items;
  }

  private getFileIcon(fileName: string): React.ComponentType<{ size?: number }> {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    // Excel files
    if (['xlsx', 'xls', 'xlsm', 'xlsb', 'xltx', 'xltm', 'xlam', 'csv'].includes(ext)) {
      return FileSpreadsheet;
    }

    // Word files
    if (['docx', 'doc', 'docm', 'dotx', 'dotm', 'rtf', 'odt'].includes(ext)) {
      return FileType;
    }

    // PowerPoint files
    if (['pptx', 'ppt', 'pptm', 'potx', 'potm', 'ppsx', 'ppsm', 'odp'].includes(ext)) {
      return Presentation;
    }

    // PDF files
    if (['pdf'].includes(ext)) {
      return FileCheck;
    }

    // Database files
    if (['db', 'sqlite', 'sqlite3', 'mdb', 'accdb', 'dbf'].includes(ext)) {
      return Database;
    }

    // Email files
    if (['msg', 'eml', 'pst', 'ost'].includes(ext)) {
      return Mail;
    }

    // Financial/Accounting files
    if (['qbb', 'qbw', 'qbx', 'qfx', 'ofx'].includes(ext)) {
      return Calculator;
    }

    // Code files
    if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'vb', 'vbs'].includes(ext)) {
      return FileCode;
    }

    // Text/Document files
    if (['txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'scss', 'sass', 'log', 'ini', 'cfg', 'conf'].includes(ext)) {
      return FileText;
    }

    // Image files
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff', 'tif', 'psd', 'ai', 'eps'].includes(ext)) {
      return FileImage;
    }

    // Video files
    if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'mpg', 'mpeg', '3gp', 'm4v'].includes(ext)) {
      return FileVideo;
    }

    // Audio files
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus', 'aiff', 'ape'].includes(ext)) {
      return FileAudio;
    }

    // Archive files
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'cab', 'iso', 'dmg', 'pkg'].includes(ext)) {
      return FileArchive;
    }

    return File;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  // Force immediate cache refresh (ignoring loading state)
  async forceRefresh(): Promise<void> {
    this.lastCacheTime = 0;
    this.isLoading = false; // Reset loading state
    await this.refreshCacheIfNeeded();
  }

  // Check if provider is currently loading
  isCurrentlyLoading(): boolean {
    return this.isLoading;
  }
}

export const workspaceDirectoryProvider = new WorkspaceDirectoryProvider();