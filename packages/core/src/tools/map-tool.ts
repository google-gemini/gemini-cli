/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { Config } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';
import { MAP_TOOL_NAME } from './tool-names.js';
import { MAP_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

export interface MapToolParams {
  dir_path?: string;
}

class MapToolInvocation extends BaseToolInvocation<MapToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    params: MapToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    return `Mapping project structure in ${this.params.dir_path || 'workspace root'}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const targetDir = this.params.dir_path
      ? path.resolve(this.config.getTargetDir(), this.params.dir_path)
      : this.config.getTargetDir();

    const validationError = this.config.validatePathAccess(targetDir, 'read');
    if (validationError) {
      return {
        llmContent: validationError,
        returnDisplay: 'Path not in workspace.',
        error: {
          message: validationError,
          type: ToolErrorType.PATH_NOT_IN_WORKSPACE,
        },
      };
    }

    try {
      const pkgPath = path.join(targetDir, 'package.json');
      let dependencies: Record<string, string> = {};
      let workspaces: string[] = [];
      try {
        const pkgContent = await fs.readFile(pkgPath, 'utf8');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const pkgData = JSON.parse(pkgContent) as Record<string, unknown>;
        dependencies = {};
        const deps = pkgData['dependencies'];
        const devDeps = pkgData['devDependencies'];
        if (deps && typeof deps === 'object' && !Array.isArray(deps)) {
          Object.assign(dependencies, deps);
        }
        if (devDeps && typeof devDeps === 'object' && !Array.isArray(devDeps)) {
          Object.assign(dependencies, devDeps);
        }
        const ws = pkgData['workspaces'];
        workspaces = Array.isArray(ws)
          ? ws.filter((item): item is string => typeof item === 'string')
          : [];
      } catch (_e) {
        // no package.json or invalid
      }

      // Scan for common entry points and structure
      const globOptions = {
        cwd: targetDir,
        nodir: true,
        ignore: this.config.getFileExclusions().getGlobExcludes(),
      };
      const files = await glob('**/*.{ts,tsx,js,jsx}', globOptions);

      const fileDiscovery = this.config.getFileService();
      const relativePaths = files.map((f) =>
        path.relative(this.config.getTargetDir(), path.join(targetDir, f)),
      );
      const filteredRelativePaths = fileDiscovery.filterFiles(relativePaths);
      const filteredFiles = filteredRelativePaths.map((p) =>
        path.relative(targetDir, path.join(this.config.getTargetDir(), p)),
      );

      const entryPoints = filteredFiles.filter((f) =>
        f.match(/(index|main|cli|bin)\.(ts|js)x?$/),
      );

      const fileImports: Record<string, string[]> = {};

      // Sample imports from entry points
      for (const entry of entryPoints.slice(0, 10)) {
        try {
          const content = await fs.readFile(
            path.join(targetDir, entry),
            'utf8',
          );
          const lines = content.split('\n').slice(0, 20);
          const imports: string[] = [];

          for (const line of lines) {
            const match = line.match(/import(?:.*from)?\s+['"]([^'"]+)['"]/);
            if (match && match[1]) {
              imports.push(match[1]);
            }
          }
          if (imports.length > 0) {
            fileImports[entry] = imports;
          }
        } catch (_e) {
          // ignore read errors on individual files
        }
      }

      const resultObj = {
        scanDirectory: targetDir,
        dependencies: Object.keys(dependencies),
        workspaces,
        entryPoints,
        keyFileImports: fileImports,
      };

      const jsonStr = JSON.stringify(resultObj, null, 2);

      return {
        llmContent: jsonStr,
        returnDisplay: `Mapped project structure (${entryPoints.length} entry points found).`,
      };
    } catch (error) {
      const errorMsg = `Error mapping project: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: errorMsg,
        returnDisplay: 'Failed to map project.',
        error: { message: errorMsg, type: ToolErrorType.MAP_EXECUTION_ERROR },
      };
    }
  }
}

export class MapTool extends BaseDeclarativeTool<MapToolParams, ToolResult> {
  static readonly Name = MAP_TOOL_NAME;

  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      MapTool.Name,
      'MapProject',
      MAP_DEFINITION.base.description!,
      Kind.Search,
      MAP_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  protected override validateToolParamValues(
    params: MapToolParams,
  ): string | null {
    if (params.dir_path) {
      const resolvedPath = path.resolve(
        this.config.getTargetDir(),
        params.dir_path,
      );
      return this.config.validatePathAccess(resolvedPath, 'read');
    }
    return null;
  }

  protected createInvocation(
    params: MapToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<MapToolParams, ToolResult> {
    return new MapToolInvocation(
      this.config,
      params,
      messageBus ?? this.messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(MAP_DEFINITION, modelId);
  }
}
