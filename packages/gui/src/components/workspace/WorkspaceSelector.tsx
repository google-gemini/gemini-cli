import React, { useState } from 'react';
import { Folder, Plus, Check, X, FolderOpen, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAppStore } from '@/stores/appStore';
import { useWorkspaceDirectories } from '@/hooks';
import { cn } from '@/utils/cn';
import type { WorkspaceConfig } from '@/types';

interface WorkspaceSelectorProps {
  onClose: () => void;
}

export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({ onClose }) => {
  const {
    workspaces,
    currentWorkspace,
    setCurrentWorkspace,
    addWorkspace,
    removeWorkspace
  } = useAppStore();
  
  const {
    directories: workspaceDirectories,
    loading: directoriesLoading,
    error: directoriesError,
    addDirectory: addWorkspaceDirectory
  } = useWorkspaceDirectories();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWorkspacePath, setNewWorkspacePath] = useState('');
  const [addingWorkspace, setAddingWorkspace] = useState(false);

  const handleWorkspaceSelect = async (workspace: WorkspaceConfig) => {
    if (workspace.id === currentWorkspace?.id) {
      onClose();
      return;
    }

    setAddingWorkspace(true);
    try {
      // Add all directories from workspace to the multimodel system
      for (const directory of workspace.directories) {
        await addWorkspaceDirectory(directory);
      }
      setCurrentWorkspace(workspace);
      onClose();
    } catch (error) {
      console.error('Failed to switch workspace:', error);
    } finally {
      setAddingWorkspace(false);
    }
  };

  const handleAddWorkspace = async () => {
    if (!newWorkspacePath.trim()) return;

    setAddingWorkspace(true);
    try {
      // Verify directory exists and is accessible by adding it
      await addWorkspaceDirectory(newWorkspacePath.trim());
      
      const newWorkspace: WorkspaceConfig = {
        id: `workspace-${Date.now()}`,
        name: newWorkspacePath.split(/[/\\]/).pop() || 'New Workspace',
        directories: [newWorkspacePath.trim()],
        createdAt: new Date()
      };
      
      addWorkspace(newWorkspace);
      setCurrentWorkspace(newWorkspace);
      setNewWorkspacePath('');
      setShowAddForm(false);
      onClose();
    } catch (error) {
      console.error('Failed to add workspace:', error);
    } finally {
      setAddingWorkspace(false);
    }
  };

  const handleRemoveWorkspace = (workspaceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeWorkspace(workspaceId);
    
    if (currentWorkspace?.id === workspaceId) {
      setCurrentWorkspace(null);
    }
  };

  const selectDirectory = async () => {
    try {
      // Use Electron's dialog API if available
      if ((globalThis as any).electronAPI?.dialog?.showOpenDialog) {
        const result = await (globalThis as any).electronAPI.dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Select Workspace Directory'
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
          setNewWorkspacePath(result.filePaths[0]);
        }
      } else {
        // Fallback for development or non-Electron environments
        const directory = prompt('Enter directory path:');
        if (directory) {
          setNewWorkspacePath(directory);
        }
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  return (
    <Card className="w-96 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Select Workspace</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ×
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error Display */}
        {directoriesError && (
          <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
            <AlertCircle size={12} />
            <span>{directoriesError}</span>
          </div>
        )}

        {/* Current Workspace Directories */}
        {workspaceDirectories.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-muted-foreground">Active Directories</h4>
              {directoriesLoading && <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {/* Remove duplicates from workspaceDirectories */}
              {[...new Set(workspaceDirectories)].map((directory, index) => (
                <div
                  key={`${directory}-${index}`}
                  className="flex items-center gap-2 px-2 py-1 bg-accent/50 rounded text-xs font-mono"
                >
                  <FolderOpen size={12} />
                  <span className="truncate">{directory}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workspace Selection */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Workspaces</h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {workspaces.map((workspace) => (
              <Button
                key={workspace.id}
                variant="ghost"
                className={cn(
                  "w-full justify-start h-auto p-3 group",
                  currentWorkspace?.id === workspace.id && "bg-accent"
                )}
                onClick={() => handleWorkspaceSelect(workspace)}
                disabled={addingWorkspace || directoriesLoading}
              >
                <div className="flex items-center gap-3 w-full">
                  <Folder size={16} className="text-primary flex-shrink-0" />
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-medium text-sm">{workspace.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {workspace.directories.length} director{workspace.directories.length === 1 ? 'y' : 'ies'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {currentWorkspace?.id === workspace.id && (
                      <Check size={14} className="text-primary" />
                    )}
                    <div
                      className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 rounded flex items-center justify-center hover:bg-destructive/10 transition-colors cursor-pointer"
                      onClick={(e) => handleRemoveWorkspace(workspace.id, e)}
                    >
                      <X size={12} />
                    </div>
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* Add New Workspace */}
        {showAddForm ? (
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex gap-2">
              <Input
                placeholder="Enter workspace directory..."
                value={newWorkspacePath}
                onChange={(e) => setNewWorkspacePath(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={selectDirectory}
                className="h-9 w-9"
              >
                <Folder size={14} />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAddWorkspace}
                disabled={!newWorkspacePath.trim() || addingWorkspace || directoriesLoading}
                className="flex-1"
              >
                Add
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddForm(false);
                  setNewWorkspacePath('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-border">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-auto p-3"
              onClick={() => setShowAddForm(true)}
            >
              <Plus size={16} />
              <span className="text-sm">Add Workspace Directory</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};