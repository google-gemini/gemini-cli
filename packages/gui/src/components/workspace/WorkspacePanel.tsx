import React, { useState } from 'react';
import { 
  FolderOpen, 
  Plus,
  Folder,
  Check,
  Settings,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAppStore } from '@/stores/appStore';
import { useWorkspaceDirectories } from '@/hooks';
import { cn } from '@/utils/cn';
import type { WorkspaceConfig } from '@/types';

export const WorkspacePanel: React.FC = () => {
  const {
    workspaces,
    currentWorkspace,
    setCurrentWorkspace,
    addWorkspace,
    updateWorkspace
  } = useAppStore();
  
  const {
    directories: activeDirectories,
    loading: directoriesLoading,
    error: directoriesError,
    addDirectory: addWorkspaceDirectory,
    setDirectories: setWorkspaceDirectories
  } = useWorkspaceDirectories();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDirectoryPath, setNewDirectoryPath] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAddDirectory = async () => {
    if (!newDirectoryPath.trim()) return;

    setAdding(true);
    try {
      const directoryPath = newDirectoryPath.trim();
      
      // Add directory to working directories
      await addWorkspaceDirectory(directoryPath);
      
      // Create workspace name from directory path
      const directoryName = directoryPath.split(/[\\/]/).pop() || directoryPath;
      const workspaceName = `${directoryName}`;
      
      // Check if a workspace with this directory already exists
      const existingWorkspace = workspaces.find(ws => 
        ws.directories.includes(directoryPath)
      );
      
      if (!existingWorkspace) {
        // Create new workspace for this directory
        const newWorkspace: WorkspaceConfig = {
          id: `workspace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: workspaceName,
          directories: [directoryPath],
          createdAt: new Date(),
          lastUsed: new Date()
        };
        
        addWorkspace(newWorkspace);
        console.log('Created new workspace for directory:', workspaceName, directoryPath);
      }
      
      setNewDirectoryPath('');
      setShowAddForm(false);
      console.log('Added working directory:', directoryPath);
    } catch (error) {
      console.error('Failed to add directory:', error);
    } finally {
      setAdding(false);
    }
  };

  const selectDirectory = async () => {
    try {
      if ((globalThis as any).electronAPI?.dialog?.showOpenDialog) {
        const result = await (globalThis as any).electronAPI.dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Select Working Directory'
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
          setNewDirectoryPath(result.filePaths[0]);
        }
      } else {
        // Fallback for non-Electron environments
        const directory = prompt('Enter directory path:');
        if (directory?.trim()) {
          setNewDirectoryPath(directory.trim());
        }
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleWorkspaceSelect = async (workspace: typeof workspaces[0]) => {
    try {
      // Update workspace lastUsed time
      updateWorkspace(workspace.id, { lastUsed: new Date() });
      
      // Set as current workspace in frontend
      setCurrentWorkspace({ ...workspace, lastUsed: new Date() });
      
      // Add all directories from this workspace to active working directories
      const newActiveDirectories = [...new Set([...activeDirectories, ...workspace.directories])];
      await setWorkspaceDirectories(newActiveDirectories);
      
      console.log(`Added workspace "${workspace.name}" directories to active workspace:`, workspace.directories);
    } catch (error) {
      console.error('Failed to activate workspace:', error);
    }
  };

  const handleRemoveDirectory = async (directoryToRemove: string) => {
    try {
      // Remove from active directories
      const newActiveDirectories = activeDirectories.filter(dir => dir !== directoryToRemove);
      await setWorkspaceDirectories(newActiveDirectories);
      
      console.log('Removed directory from active workspace:', directoryToRemove);
    } catch (error) {
      console.error('Failed to remove directory:', error);
    }
  };

  // Get unique directories, removing duplicates
  const uniqueDirectories = [...new Set(activeDirectories)];

  return (
    <div className="p-4 border-t border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-primary" />
          <span className="font-medium text-sm">Working Directories</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setShowAddForm(!showAddForm)}
          disabled={adding}
        >
          <Plus size={12} />
        </Button>
      </div>

      {/* Error Display */}
      {directoriesError && (
        <div className="mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
          {directoriesError}
        </div>
      )}

      {/* Active Directories List */}
      <div className="space-y-1 mb-3">
        {directoriesLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading directories...
          </div>
        )}
        
        {uniqueDirectories.length === 0 && !directoriesLoading && (
          <div className="text-xs text-muted-foreground py-2">
            No working directories set
          </div>
        )}
        
        {uniqueDirectories.map((directory, index) => (
          <div
            key={`${directory}-${index}`}
            className="flex items-center gap-2 p-2 bg-accent/30 rounded text-xs font-mono group hover:bg-accent/50 transition-colors"
          >
            <FolderOpen size={12} className="text-muted-foreground flex-shrink-0" />
            <span className="truncate flex-1" title={directory}>
              {directory}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRemoveDirectory(directory)}
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20 hover:text-destructive"
              title="Remove directory"
            >
              <X size={10} />
            </Button>
          </div>
        ))}
      </div>

      {/* Add Directory Form */}
      {showAddForm && (
        <div className="space-y-2 p-2 bg-accent/10 rounded border">
          {/* Quick Browse Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={selectDirectory}
            disabled={adding}
            className="w-full h-7 text-xs gap-2"
          >
            <Folder size={12} />
            Browse for Folder
          </Button>
          
          {/* Or Manual Path Input */}
          <div className="text-center">
            <span className="text-xs text-muted-foreground">or</span>
          </div>
          
          <div className="flex gap-1">
            <Input
              placeholder="Paste directory path..."
              value={newDirectoryPath}
              onChange={(e) => setNewDirectoryPath(e.target.value)}
              className="flex-1 text-xs"
              disabled={adding}
            />
          </div>
          
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={handleAddDirectory}
              disabled={!newDirectoryPath.trim() || adding}
              className="flex-1 h-6 text-xs"
            >
              {adding ? 'Adding...' : 'Add'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddForm(false);
                setNewDirectoryPath('');
              }}
              disabled={adding}
              className="flex-1 h-6 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Recent Workspaces */}
      {workspaces.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-center gap-2 mb-2">
            <Settings size={12} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Recent Workspaces</span>
          </div>
          <div className="space-y-1">
            {workspaces
              .sort((a, b) => {
                const aTime = a.lastUsed instanceof Date ? a.lastUsed.getTime() : new Date(a.lastUsed || 0).getTime();
                const bTime = b.lastUsed instanceof Date ? b.lastUsed.getTime() : new Date(b.lastUsed || 0).getTime();
                return bTime - aTime;
              })
              .slice(0, 3)
              .map((workspace) => (
              <div
                key={workspace.id}
                className={cn(
                  "flex items-center gap-2 p-1.5 rounded text-xs cursor-pointer hover:bg-accent/30 transition-colors",
                  currentWorkspace?.id === workspace.id && "bg-accent/50"
                )}
                onClick={() => handleWorkspaceSelect(workspace)}
              >
                <Folder size={10} className="text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1">{workspace.name}</span>
                {currentWorkspace?.id === workspace.id && (
                  <Check size={10} className="text-primary flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};