export * from './types';
export * from './AutocompleteSystem';
export * from './AutocompleteDropdown';
export * from './useAutocomplete';
export * from './providers/WorkspaceDirectoryProvider';

// Initialize providers
import { autocompleteSystem } from './AutocompleteSystem';
import { workspaceDirectoryProvider } from './providers/WorkspaceDirectoryProvider';

// Register default providers
autocompleteSystem.registerProvider(workspaceDirectoryProvider);