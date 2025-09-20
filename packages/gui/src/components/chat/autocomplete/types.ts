export interface AutocompleteItem {
  id: string;
  label: string;
  value: string;
  description?: string;
  icon?: React.ComponentType<{ size?: number }>;
  category?: string;
  type?: 'file' | 'folder' | 'workspace';
  size?: number; // File size in bytes
  modified?: Date; // Last modified date
  level?: number; // Hierarchy level (0 for root, 1 for first-level, etc.)
}

export interface AutocompleteProvider {
  trigger: string; // e.g., '@', '#', '/'
  name: string;
  description?: string;
  getItems(query: string): Promise<AutocompleteItem[]> | AutocompleteItem[];
  forceRefresh?(): Promise<void>;
}

export interface AutocompleteMatch {
  provider: AutocompleteProvider;
  query: string;
  startPos: number;
  endPos: number;
}