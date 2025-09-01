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
      
      // Add to current directories immediately for instant UI feedback
      const newDirectories = [...directories, directory];
      setDirectories(newDirectories);
      
      // Save to localStorage immediately
      localStorage.setItem('active-workspace-directories', JSON.stringify(newDirectories));
      
      // Then sync to backend
      await multiModelService.addWorkspaceDirectory(directory, basePath);
      console.log('Added directory to localStorage and backend:', directory);
    } catch (err) {
      // Revert UI state on error
      setDirectories(prev => prev.filter(d => d !== directory));
      localStorage.setItem('active-workspace-directories', JSON.stringify(directories));
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to add workspace directory';
      setError(errorMessage);
      throw err; // Re-throw for component-level handling
    }
  };

  const setWorkspaceDirectories = async (newDirectories: readonly string[]) => {
    try {
      setError(null);
      
      // Update UI immediately for instant feedback
      setDirectories(newDirectories);
      
      // Save to localStorage immediately
      localStorage.setItem('active-workspace-directories', JSON.stringify(newDirectories));
      
      // Then sync to backend
      await multiModelService.setWorkspaceDirectories(newDirectories);
      // console.log('Set workspace directories in localStorage and backend:', newDirectories);
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
    // Load from localStorage first for immediate UI update
    const loadFromLocalStorage = () => {
      try {
        const saved = localStorage.getItem('active-workspace-directories');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            // console.log('Loaded workspace directories from localStorage:', parsed);
            setDirectories(parsed);
            setError(null);
          }
        }
      } catch (error) {
        console.warn('Failed to load directories from localStorage:', error);
      }
    };

    // Load from localStorage immediately for instant UI
    loadFromLocalStorage();
    
    // Wait a bit for MultiModelService to initialize, then sync
    const syncToBackend = async () => {
      try {
        const saved = localStorage.getItem('active-workspace-directories');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Wait for service to be ready, then sync
            setTimeout(async () => {
              try {
                await multiModelService.setWorkspaceDirectories(parsed);
                // console.log('Synced localStorage directories to backend:', parsed);
              } catch (error) {
                console.warn('Failed to sync localStorage directories to backend (will retry):', error);
                
                // Retry after a longer delay
                setTimeout(async () => {
                  try {
                    await multiModelService.setWorkspaceDirectories(parsed);
                    console.log('Successfully synced localStorage directories to backend on retry');
                  } catch (retryError) {
                    console.warn('Failed to sync on retry, will use localStorage data only:', retryError);
                  }
                }, 3000);
              }
            }, 2000);
          }
        }
      } catch (error) {
        console.warn('Error in sync to backend:', error);
      }
    };

    syncToBackend();
    
    // Also try to load from backend (this might update with newer data)
    setTimeout(() => {
      loadDirectories();
    }, 1000);

    // Set up real-time sync listener
    let cleanup: (() => void) | undefined;
    
    if ((globalThis as any).electronAPI?.onWorkspaceDirectoriesChanged) {
      cleanup = (globalThis as any).electronAPI.onWorkspaceDirectoriesChanged(
        (_event: any, data: { type: string; directories: readonly string[]; changedDirectory?: string }) => {
          console.log('Workspace directories changed:', data);
          setDirectories(data.directories);
          setError(null);
          
          // Save to localStorage
          localStorage.setItem('active-workspace-directories', JSON.stringify(data.directories));
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