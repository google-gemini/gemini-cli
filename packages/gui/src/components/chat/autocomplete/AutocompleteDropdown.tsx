import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { FolderOpen, FileText } from 'lucide-react';
import type { AutocompleteItem } from './types';
import { workspaceDirectoryProvider } from './providers/WorkspaceDirectoryProvider';

interface AutocompleteDropdownProps {
  items: AutocompleteItem[];
  selectedIndex: number;
  onSelect: (item: AutocompleteItem) => void;
  onClose: () => void;
  position: { top: number; left: number };
  visible: boolean;
  onRefresh?: () => void; // Add callback to trigger refresh
}

export const AutocompleteDropdown: React.FC<AutocompleteDropdownProps> = ({
  items,
  selectedIndex,
  onSelect,
  onClose,
  position,
  visible,
  onRefresh
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'folders' | 'files'>(
    () => workspaceDirectoryProvider.getFilterMode()
  );

  const handleFilterModeChange = async (mode: 'all' | 'folders' | 'files') => {
    setFilterMode(mode);
    workspaceDirectoryProvider.setFilterMode(mode);
    // Force refresh to apply filter changes
    await workspaceDirectoryProvider.forceRefresh();
    // Trigger UI refresh
    onRefresh?.();
  };

  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (visible && selectedIndex >= 0) {
      const selectedElement = dropdownRef.current?.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [selectedIndex, visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      ref={dropdownRef}
      className="fixed z-50 w-96 bg-popover border border-border rounded-md shadow-lg"
      style={{
        top: position.top,
        left: position.left
      }}
    >
      {/* Filter buttons bar */}
      <div className="flex items-center gap-2 p-2 border-b border-border bg-muted/50">
        <span className="text-xs text-muted-foreground">Show:</span>
        <button
          className={cn(
            "px-2 py-1 text-xs rounded transition-colors",
            filterMode === 'all'
              ? "bg-primary text-primary-foreground"
              : "bg-background text-foreground hover:bg-accent"
          )}
          onClick={() => handleFilterModeChange('all')}
        >
          All
        </button>
        <button
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
            filterMode === 'folders'
              ? "bg-primary text-primary-foreground"
              : "bg-background text-foreground hover:bg-accent"
          )}
          onClick={() => handleFilterModeChange('folders')}
        >
          <FolderOpen size={12} />
          Folders
        </button>
        <button
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
            filterMode === 'files'
              ? "bg-primary text-primary-foreground"
              : "bg-background text-foreground hover:bg-accent"
          )}
          onClick={() => handleFilterModeChange('files')}
        >
          <FileText size={12} />
          Files
        </button>
        <div className="ml-auto text-xs text-muted-foreground">
          {items.length} items
        </div>
      </div>

      {/* Items list */}
      <div className="max-h-80 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <div className="text-sm">No items to display</div>
            <div className="text-xs mt-1">Try adjusting the filters above</div>
          </div>
        ) : (
          items.map((item, index) => {
        const Icon = item.icon;

        return (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-3 py-2 cursor-pointer transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              selectedIndex === index && "bg-accent text-accent-foreground"
            )}
            style={{
              paddingLeft: `${12 + (item.level || 0) * 16}px`,
              paddingRight: '12px'
            }}
            onClick={() => onSelect(item)}
          >
            {Icon && (
              <div className="text-muted-foreground flex-shrink-0">
                <Icon size={16} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {item.label}
              </div>
              {item.description && (
                <div className="text-xs text-muted-foreground truncate">
                  {item.description}
                </div>
              )}
              <div className="text-xs text-muted-foreground font-mono truncate">
                {item.value}
              </div>
            </div>

            {item.type && (
              <div className={cn(
                "text-xs px-2 py-0.5 rounded",
                item.type === 'workspace' && "bg-primary/10 text-primary",
                item.type === 'folder' && "bg-blue-500/10 text-blue-600",
                item.type === 'file' && "bg-green-500/10 text-green-600"
              )}>
                {item.type}
              </div>
            )}
          </div>
        );
      })
        )}
      </div>
    </div>
  );
};