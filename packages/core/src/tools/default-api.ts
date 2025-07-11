/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReadFileTool } from './read-file.js';
import { WriteFileTool } from './write-file.js';
import { ShellTool } from './shell.js';
import { GlobTool } from './glob.js';
import { GrepTool } from './grep.js';
import { LSTool } from './ls.js';
import { ReadManyFilesTool } from './read-many-files.js';
import { WebFetchTool } from './web-fetch.js';
import { WebSearchTool } from './web-search.js';
import { EditTool } from './edit.js';
import { Config } from '../config/config.js';

// This is a placeholder for the actual default_api implementation.
// In a real scenario, these tools would be instantiated and exposed
// through a more robust mechanism, possibly involving a tool registry
// and a configuration object.

// For the purpose of satisfying the TypeScript compiler and providing
// a minimal working example, we'll create a mock Config and expose
// the tools directly.

const mockConfig: Config = {} as Config; // Mock Config object

export const default_api = {
  read_file: new ReadFileTool('/', mockConfig),
  write_file: new WriteFileTool(mockConfig),
  run_shell_command: new ShellTool(mockConfig),
  glob: new GlobTool('/', mockConfig),
  search_file_content: new GrepTool('/'),
  list_directory: new LSTool('/', mockConfig),
  read_many_files: new ReadManyFilesTool('/', mockConfig),
  web_fetch: new WebFetchTool(mockConfig),
  google_web_search: new WebSearchTool(mockConfig),
  replace: new EditTool(mockConfig),
};
