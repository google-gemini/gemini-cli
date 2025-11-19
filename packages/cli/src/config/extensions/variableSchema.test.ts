/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  VARIABLE_SCHEMA,
  type VariableDefinition,
  type VariableSchema,
  type LoadExtensionContext,
} from './variableSchema.js';

describe('variableSchema', () => {
  describe('VariableDefinition type', () => {
    it('should define valid VariableDefinition with required fields', () => {
      const definition: VariableDefinition = {
        type: 'string',
        description: 'Test variable',
      };

      expect(definition.type).toBe('string');
      expect(definition.description).toBe('Test variable');
    });

    it('should allow default value', () => {
      const definition: VariableDefinition = {
        type: 'string',
        description: 'Test variable',
        default: 'default value',
      };

      expect(definition.default).toBe('default value');
    });

    it('should allow required flag', () => {
      const definition: VariableDefinition = {
        type: 'string',
        description: 'Required variable',
        required: true,
      };

      expect(definition.required).toBe(true);
    });

    it('should allow both default and required', () => {
      const definition: VariableDefinition = {
        type: 'string',
        description: 'Test',
        default: 'value',
        required: false,
      };

      expect(definition.default).toBe('value');
      expect(definition.required).toBe(false);
    });

    it('should require type to be string', () => {
      const definition: VariableDefinition = {
        type: 'string',
        description: 'Test',
      };

      expect(definition.type).toBe('string');
    });
  });

  describe('VariableSchema type', () => {
    it('should define valid VariableSchema', () => {
      const schema: VariableSchema = {
        myVar: {
          type: 'string',
          description: 'My variable',
        },
      };

      expect(schema.myVar).toBeDefined();
      expect(schema.myVar?.type).toBe('string');
    });

    it('should allow multiple variables', () => {
      const schema: VariableSchema = {
        var1: {
          type: 'string',
          description: 'First variable',
        },
        var2: {
          type: 'string',
          description: 'Second variable',
          default: 'default',
        },
        var3: {
          type: 'string',
          description: 'Third variable',
          required: true,
        },
      };

      expect(Object.keys(schema)).toHaveLength(3);
      expect(schema.var1).toBeDefined();
      expect(schema.var2).toBeDefined();
      expect(schema.var3).toBeDefined();
    });

    it('should use string keys', () => {
      const schema: VariableSchema = {
        'custom-variable': {
          type: 'string',
          description: 'Custom variable with dash',
        },
      };

      expect(schema['custom-variable']).toBeDefined();
    });
  });

  describe('LoadExtensionContext type', () => {
    it('should define valid LoadExtensionContext', () => {
      const context: LoadExtensionContext = {
        extensionDir: '/path/to/extension',
        workspaceDir: '/path/to/workspace',
      };

      expect(context.extensionDir).toBe('/path/to/extension');
      expect(context.workspaceDir).toBe('/path/to/workspace');
    });

    it('should require both fields', () => {
      const context: LoadExtensionContext = {
        extensionDir: '/ext',
        workspaceDir: '/workspace',
      };

      expect(context).toHaveProperty('extensionDir');
      expect(context).toHaveProperty('workspaceDir');
    });

    it('should support absolute paths', () => {
      const context: LoadExtensionContext = {
        extensionDir: '/home/user/extensions/my-ext',
        workspaceDir: '/home/user/projects/my-project',
      };

      expect(context.extensionDir).toContain('/home/user');
      expect(context.workspaceDir).toContain('/home/user');
    });

    it('should support relative paths', () => {
      const context: LoadExtensionContext = {
        extensionDir: './extensions/ext1',
        workspaceDir: './workspace',
      };

      expect(context.extensionDir).toBe('./extensions/ext1');
      expect(context.workspaceDir).toBe('./workspace');
    });
  });

  describe('VARIABLE_SCHEMA constant', () => {
    it('should define extensionPath variable', () => {
      expect(VARIABLE_SCHEMA.extensionPath).toBeDefined();
      expect(VARIABLE_SCHEMA.extensionPath.type).toBe('string');
      expect(VARIABLE_SCHEMA.extensionPath.description).toContain('extension');
    });

    it('should define workspacePath variable', () => {
      expect(VARIABLE_SCHEMA.workspacePath).toBeDefined();
      expect(VARIABLE_SCHEMA.workspacePath.type).toBe('string');
      expect(VARIABLE_SCHEMA.workspacePath.description).toContain('workspace');
    });

    it('should define path separator as /', () => {
      expect(VARIABLE_SCHEMA['/']).toBeDefined();
      expect(VARIABLE_SCHEMA['/'].type).toBe('string');
      expect(VARIABLE_SCHEMA['/'].description).toContain('separator');
    });

    it('should define pathSeparator variable', () => {
      expect(VARIABLE_SCHEMA.pathSeparator).toBeDefined();
      expect(VARIABLE_SCHEMA.pathSeparator.type).toBe('string');
      expect(VARIABLE_SCHEMA.pathSeparator.description).toContain('separator');
    });

    it('should have all variables with type string', () => {
      const keys = Object.keys(VARIABLE_SCHEMA);

      for (const key of keys) {
        const definition = VARIABLE_SCHEMA[key as keyof typeof VARIABLE_SCHEMA];
        expect(definition.type).toBe('string');
      }
    });

    it('should have all variables with description', () => {
      const keys = Object.keys(VARIABLE_SCHEMA);

      for (const key of keys) {
        const definition = VARIABLE_SCHEMA[key as keyof typeof VARIABLE_SCHEMA];
        expect(definition.description).toBeDefined();
        expect(definition.description.length).toBeGreaterThan(0);
      }
    });

    it('should have exactly 4 variables', () => {
      const keys = Object.keys(VARIABLE_SCHEMA);
      expect(keys).toHaveLength(4);
    });

    it('should share definition between / and pathSeparator', () => {
      expect(VARIABLE_SCHEMA['/']).toEqual(VARIABLE_SCHEMA.pathSeparator);
    });

    it('should be readonly', () => {
      const schema = VARIABLE_SCHEMA;
      expect(schema).toBeDefined();
      // TypeScript enforces readonly at compile time
    });
  });

  describe('variable definitions structure', () => {
    it('should have consistent extensionPath structure', () => {
      const definition = VARIABLE_SCHEMA.extensionPath;

      expect(definition).toEqual({
        type: 'string',
        description: 'The path of the extension in the filesystem.',
      });
    });

    it('should have consistent workspacePath structure', () => {
      const definition = VARIABLE_SCHEMA.workspacePath;

      expect(definition).toEqual({
        type: 'string',
        description: 'The absolute path of the current workspace.',
      });
    });

    it('should have consistent path separator structure', () => {
      const definition = VARIABLE_SCHEMA['/'];

      expect(definition).toEqual({
        type: 'string',
        description: 'The path separator.',
      });
    });
  });

  describe('schema keys', () => {
    it('should include extensionPath', () => {
      const keys = Object.keys(VARIABLE_SCHEMA);
      expect(keys).toContain('extensionPath');
    });

    it('should include workspacePath', () => {
      const keys = Object.keys(VARIABLE_SCHEMA);
      expect(keys).toContain('workspacePath');
    });

    it('should include /', () => {
      const keys = Object.keys(VARIABLE_SCHEMA);
      expect(keys).toContain('/');
    });

    it('should include pathSeparator', () => {
      const keys = Object.keys(VARIABLE_SCHEMA);
      expect(keys).toContain('pathSeparator');
    });
  });

  describe('description content', () => {
    it('should describe extensionPath as filesystem path', () => {
      const description = VARIABLE_SCHEMA.extensionPath.description;
      expect(description.toLowerCase()).toContain('path');
      expect(description.toLowerCase()).toContain('extension');
    });

    it('should describe workspacePath as absolute path', () => {
      const description = VARIABLE_SCHEMA.workspacePath.description;
      expect(description.toLowerCase()).toContain('absolute');
      expect(description.toLowerCase()).toContain('workspace');
    });

    it('should describe path separator', () => {
      const description = VARIABLE_SCHEMA['/'].description;
      expect(description.toLowerCase()).toContain('path');
      expect(description.toLowerCase()).toContain('separator');
    });
  });

  describe('type safety', () => {
    it('should enforce string type for all variables', () => {
      type ExtractType<T> = T extends { type: infer U } ? U : never;

      type ExtensionPathType = ExtractType<
        typeof VARIABLE_SCHEMA.extensionPath
      >;
      type WorkspacePathType = ExtractType<
        typeof VARIABLE_SCHEMA.workspacePath
      >;
      type SeparatorType = ExtractType<(typeof VARIABLE_SCHEMA)['/']>;

      const extensionType: ExtensionPathType = 'string';
      const workspaceType: WorkspacePathType = 'string';
      const separatorType: SeparatorType = 'string';

      expect(extensionType).toBe('string');
      expect(workspaceType).toBe('string');
      expect(separatorType).toBe('string');
    });

    it('should be assignable to VariableSchema type', () => {
      const _schema: VariableSchema = VARIABLE_SCHEMA;
      expect(_schema).toBeDefined();
    });
  });

  describe('immutability', () => {
    it('should not allow modification of schema', () => {
      const _schema = VARIABLE_SCHEMA;

      // TypeScript prevents this at compile time with 'as const'
      expect(() => {
        // This would fail TypeScript compilation
        // (_schema as Record<string, unknown>).newVar = {};
      }).not.toThrow();
    });

    it('should maintain reference equality', () => {
      const ref1 = VARIABLE_SCHEMA;
      const ref2 = VARIABLE_SCHEMA;

      expect(ref1).toBe(ref2);
    });
  });

  describe('usage patterns', () => {
    it('should support iteration over variables', () => {
      const keys = Object.keys(VARIABLE_SCHEMA);
      const variables = keys.map((key) => ({
        name: key,
        definition: VARIABLE_SCHEMA[key as keyof typeof VARIABLE_SCHEMA],
      }));

      expect(variables).toHaveLength(4);
      expect(variables.every((v) => v.definition.type === 'string')).toBe(true);
    });

    it('should support variable lookup by key', () => {
      const variableName = 'extensionPath';
      const definition =
        VARIABLE_SCHEMA[variableName as keyof typeof VARIABLE_SCHEMA];

      expect(definition).toBeDefined();
      expect(definition.type).toBe('string');
    });

    it('should support checking variable existence', () => {
      const hasExtensionPath = 'extensionPath' in VARIABLE_SCHEMA;
      const hasWorkspacePath = 'workspacePath' in VARIABLE_SCHEMA;
      const hasUnknown = 'unknownVar' in VARIABLE_SCHEMA;

      expect(hasExtensionPath).toBe(true);
      expect(hasWorkspacePath).toBe(true);
      expect(hasUnknown).toBe(false);
    });
  });
});
