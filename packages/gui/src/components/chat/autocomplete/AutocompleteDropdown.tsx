import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import {
  FolderOpen,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  FileSpreadsheet,
  File,
  Search,
  X
} from 'lucide-react';
import type { AutocompleteItem } from './types';
import { workspaceDirectoryProvider } from './providers/WorkspaceDirectoryProvider';

interface AutocompleteDropdownProps {
  items: AutocompleteItem[];
  selectedIndex: number;
  onSelect: (item: AutocompleteItem) => void;
  onClose: () => void;
  position: { top: number; left: number };
  visible: boolean;
  onRefresh?: () => void;
}

// Get file icon based on extension
function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
    case 'java':
    case 'cpp':
    case 'c':
    case 'cs':
    case 'go':
    case 'rs':
      return <FileCode size={16} className="text-blue-500" />;

    case 'json':
    case 'yaml':
    case 'yml':
    case 'xml':
      return <FileJson size={16} className="text-yellow-600" />;

    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return <FileImage size={16} className="text-purple-500" />;

    case 'xlsx':
    case 'xls':
    case 'csv':
      return <FileSpreadsheet size={16} className="text-green-600" />;

    case 'md':
    case 'txt':
    case 'pdf':
    case 'doc':
    case 'docx':
      return <FileText size={16} className="text-gray-600" />;

    default:
      return <File size={16} className="text-gray-400" />;
  }
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
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'folders' | 'files'>(
    () => workspaceDirectoryProvider.getFilterMode()
  );
  const [searchText, setSearchText] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter items based on search and file type
  const filteredItems = items.filter(item => {
    // Search filter
    if (searchText) {
      const search = searchText.toLowerCase();
      const matchesLabel = item.label.toLowerCase().includes(search);
      const matchesValue = item.value.toLowerCase().includes(search);
      if (!matchesLabel && !matchesValue) return false;
    }

    // File type filter - only apply to files, not folders
    if (fileTypeFilter && item.type === 'file') {
      const ext = item.label.split('.').pop()?.toLowerCase();
      if (ext !== fileTypeFilter) return false;
    }

    return true;
  });

  // Get unique file extensions from items
  const fileExtensions = Array.from(
    new Set(
      items
        .filter(item => item.type === 'file')
        .map(item => item.label.split('.').pop()?.toLowerCase())
        .filter(Boolean)
    )
  ).sort();

  const handleFilterModeChange = async (mode: 'all' | 'folders' | 'files') => {
    setFilterMode(mode);
    workspaceDirectoryProvider.setFilterMode(mode);
    await workspaceDirectoryProvider.forceRefresh();
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
    if (visible && selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [selectedIndex, visible]);

  // Focus search input when visible
  useEffect(() => {
    if (visible && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [visible]);

  // Handle ESC key to close dropdown
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [visible, onClose]);

  // Handle keyboard navigation for quick jump to first letter
  useEffect(() => {
    if (!visible) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      // Allow typing in search input
      if (e.target === searchInputRef.current) return;

      // Quick jump to first letter
      if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        const char = e.key.toLowerCase();
        const index = filteredItems.findIndex(item =>
          item.label.toLowerCase().startsWith(char)
        );
        if (index >= 0) {
          itemRefs.current[index]?.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth'
          });
        }
      }
    };

    document.addEventListener('keypress', handleKeyPress);
    return () => {
      document.removeEventListener('keypress', handleKeyPress);
    };
  }, [visible, filteredItems]);

  if (!visible) {
    return null;
  }

  return (
    <div
      ref={dropdownRef}
      className="fixed z-50 w-[500px] bg-popover border border-border rounded-md shadow-lg"
      style={{
        top: position.top,
        left: position.left
      }}
    >
      {/* Search bar */}
      <div className="p-2 border-b border-border bg-muted/50">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search files..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {searchText && (
            <button
              onClick={() => setSearchText('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Filter buttons bar */}
      <div className="flex items-center gap-2 p-2 border-b border-border bg-muted/30 flex-wrap">
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

        {/* File type filter dropdown */}
        {fileExtensions.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground ml-2">Type:</span>
            <select
              value={fileTypeFilter}
              onChange={(e) => setFileTypeFilter(e.target.value)}
              className="px-2 py-1 text-xs rounded bg-background border border-border hover:bg-accent"
            >
              <option value="">All types</option>
              {fileExtensions.map(ext => (
                <option key={ext} value={ext}>
                  .{ext}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="ml-auto text-xs text-muted-foreground">
          {filteredItems.length} / {items.length}
        </div>
      </div>

      {/* Items list with unified horizontal scroll */}
      <div className="max-h-80 overflow-y-auto overflow-x-auto">
        {filteredItems.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <div className="text-sm">No items found</div>
            <div className="text-xs mt-1">
              {searchText || fileTypeFilter
                ? 'Try adjusting your search or filters'
                : 'Try adjusting the filters above'
              }
            </div>
          </div>
        ) : (
          <div className="min-w-max">
            {filteredItems.map((item, index) => {
              const isFolder = item.type === 'folder' || item.type === 'workspace';
              const ItemIcon = isFolder ? FolderOpen : null;

              return (
                <div
                  key={item.id}
                  ref={el => { itemRefs.current[index] = el; }}
                  className={cn(
                    "flex items-center gap-3 py-2 cursor-pointer transition-colors group",
                    "hover:bg-accent hover:text-accent-foreground",
                    selectedIndex === index && "bg-accent text-accent-foreground"
                  )}
                  style={{
                    paddingLeft: `${12 + (item.level || 0) * 16}px`,
                    paddingRight: '12px'
                  }}
                  onClick={() => onSelect(item)}
                  title={`${item.label}\n${item.value}`}
                >
                  {/* Icon with color coding */}
                  <div className="flex-shrink-0">
                    {isFolder && ItemIcon ? (
                      <ItemIcon size={16} className={cn(
                        item.type === 'workspace' ? 'text-primary' : 'text-blue-500'
                      )} />
                    ) : (
                      getFileIcon(item.label)
                    )}
                  </div>

                  {/* Content without individual scroll */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium whitespace-nowrap">
                      {item.label}
                    </div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {item.description}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {item.value}
                    </div>
                  </div>

                  {/* Type badge */}
                  {item.type && (
                    <div className={cn(
                      "text-xs px-2 py-0.5 rounded flex-shrink-0",
                      item.type === 'workspace' && "bg-primary/10 text-primary",
                      item.type === 'folder' && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                      item.type === 'file' && "bg-green-500/10 text-green-600 dark:text-green-400"
                    )}>
                      {item.type}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="p-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
        Press letter keys to jump • ↑↓ navigate • Enter select • Esc close
      </div>
    </div>
  );
};
