import { useState, useEffect } from 'react';
import { multiModelService } from '@/services/multiModelService';

export interface WorkspaceDirectoriesState {
  directories: readonly string[];
  loading: boolean;
  error: string | null;
}

export interface WorkspaceDirectoriesActions {
  addDirectory: (directory: string, basePath?: string) => Promise<void>;
  setDirectories: (directories: readonly string[]) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Custom hook for managing workspace directories with real-time sync
 */
export const useWorkspaceDirectories = (): WorkspaceDirectoriesState & WorkspaceDirectoriesActions => {
  const [directories, setDirectories] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDirectories = async () => {
    try {
      setLoading(true);
      setError(null);
      const dirs = await multiModelService.getWorkspaceDirectories();
      setDirectories(dirs);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load workspace directories';
      setError(errorMessage);
      console.error('Failed to load workspace directories:', err);
    } finally {
      setLoading(false);
    }
  };

  const addDirectory = async (directory: string, basePath?: string) => {
    try {
      setError(null);
      await multiModelService.addWorkspaceDirectory(directory, basePath);
      // Real-time sync will update the directories automatically
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add workspace directory';
      setError(errorMessage);
      throw err; // Re-throw for component-level handling
    }
  };

  const setWorkspaceDirectories = async (newDirectories: readonly string[]) => {
    try {
      setError(null);
      await multiModelService.setWorkspaceDirectories(newDirectories);
      // Real-time sync will update the directories automatically
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to set workspace directories';
      setError(errorMessage);
      throw err; // Re-throw for component-level handling
    }
  };

  const refresh = async () => {
    await loadDirectories();
  };

  useEffect(() => {
    // Initial load
    loadDirectories();

    // Set up real-time sync listener
    let cleanup: (() => void) | undefined;
    
    if ((globalThis as any).electronAPI?.onWorkspaceDirectoriesChanged) {
      cleanup = (globalThis as any).electronAPI.onWorkspaceDirectoriesChanged(
        (_event: any, data: { type: string; directories: readonly string[]; changedDirectory?: string }) => {
          console.log('Workspace directories changed:', data);
          setDirectories(data.directories);
          setError(null); // Clear any previous errors on successful update
        }
      );
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return {
    directories,
    loading,
    error,
    addDirectory,
    setDirectories: setWorkspaceDirectories,
    refresh
  };
};