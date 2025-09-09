/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  updateSettingsFilePreservingFormat,
  trackEnvVarMappings,
} from './preserveOriginalFormat.js';

describe('preserveOriginalFormat', () => {
  let tempDir: string;
  let testFilePath: string;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preserve-format-test-'));
    testFilePath = path.join(tempDir, 'settings.json');
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('updateSettingsFilePreservingFormat', () => {
    it('should preserve comments when updating settings', () => {
      const originalContent = `{
  // This is a comment about the model
  "model": "gemini-2.5-pro",
  "ui": {
    // Theme configuration
    "theme": "dark"
  },
  "mcpServers": {
    // GitHub MCP server (disabled)
    /*
    "github": {
      "httpUrl": "https://api.github.com/mcp/",
      "headers": {
        "Authorization": "Bearer token"
      }
    },
    */
    "time": {
      "command": "uvx",
      "args": ["mcp-server-time"]
    }
  }
}`;

      fs.writeFileSync(testFilePath, originalContent, 'utf-8');

      // Update only the model setting
      updateSettingsFilePreservingFormat(testFilePath, {
        model: 'gemini-3.0-ultra',
      });

      const updatedContent = fs.readFileSync(testFilePath, 'utf-8');

      // Should preserve all comments
      expect(updatedContent).toContain('// This is a comment about the model');
      expect(updatedContent).toContain('// Theme configuration');
      expect(updatedContent).toContain('// GitHub MCP server (disabled)');
      expect(updatedContent).toContain('/*');
      expect(updatedContent).toContain('*/');

      // Should update the model value
      expect(updatedContent).toContain('"model": "gemini-3.0-ultra"');

      // Should not change other values
      expect(updatedContent).toContain('"theme": "dark"');
    });

    it('should preserve environment variable references', () => {
      const originalContent = `{
  "mcpServers": {
    "context7": {
      "httpUrl": "https://mcp.context7.com/mcp",
      "headers": {
        "CONTEXT7_API_KEY": "$CONTEXT7_API_KEY"
      }
    }
  }
}`;

      fs.writeFileSync(testFilePath, originalContent, 'utf-8');

      // Update a different setting, env vars should be preserved
      const envVarMappings = [
        {
          path: ['mcpServers', 'context7', 'headers', 'CONTEXT7_API_KEY'],
          originalValue: '$CONTEXT7_API_KEY',
          resolvedValue: 'actual-key-value',
        },
      ];

      updateSettingsFilePreservingFormat(
        testFilePath,
        {
          mcpServers: {
            context7: {
              httpUrl: 'https://mcp.context7.com/mcp',
              headers: {
                CONTEXT7_API_KEY: 'actual-key-value',
              },
            },
          },
        },
        envVarMappings,
      );

      const updatedContent = fs.readFileSync(testFilePath, 'utf-8');

      // Should preserve the environment variable reference
      expect(updatedContent).toContain('"CONTEXT7_API_KEY": "$CONTEXT7_API_KEY"');
      expect(updatedContent).not.toContain('actual-key-value');
    });

    it('should only update changed fields', () => {
      const originalContent = `{
  "model": "gemini-2.5-pro",
  "ui": {
    "theme": "dark",
    "showLineNumbers": true
  },
  "tools": {
    "sandbox": "enabled"
  }
}`;

      fs.writeFileSync(testFilePath, originalContent, 'utf-8');

      // Update only the theme
      updateSettingsFilePreservingFormat(testFilePath, {
        model: 'gemini-2.5-pro', // Same value
        ui: {
          theme: 'light', // Changed value
          showLineNumbers: true, // Same value
        },
        tools: {
          sandbox: 'enabled', // Same value
        },
      });

      const updatedContent = fs.readFileSync(testFilePath, 'utf-8');

      // Should update the changed value
      expect(updatedContent).toContain('"theme": "light"');

      // Should preserve unchanged values exactly as they were
      expect(updatedContent).toContain('"model": "gemini-2.5-pro"');
      expect(updatedContent).toContain('"showLineNumbers": true');
      expect(updatedContent).toContain('"sandbox": "enabled"');
    });

    it('should handle new keys being added', () => {
      const originalContent = `{
  "model": "gemini-2.5-pro"
}`;

      fs.writeFileSync(testFilePath, originalContent, 'utf-8');

      updateSettingsFilePreservingFormat(testFilePath, {
        model: 'gemini-2.5-pro',
        ui: {
          theme: 'dark',
        },
      });

      const updatedContent = fs.readFileSync(testFilePath, 'utf-8');
      const parsed = JSON.parse(updatedContent);

      expect(parsed.ui).toBeDefined();
      expect(parsed.ui.theme).toBe('dark');
    });

    it('should preserve user-specific commented-out configurations', () => {
      const originalContent = `{
  "theme": "Dracula",
  "ideMode": true,
  "hasSeenIdeIntegrationNudge": true,
  "selectedAuthType": "oauth-personal",
  "mcpServers": {
    // "context7": {
    //   "command": "npx",
    //   "args": [
    //     "-y",
    //     "@upstash/context7-mcp@latest"
    //   ]
    // },
    "sequential-thinking": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sequential-thinking"
      ]
    }
  }
}`;

      fs.writeFileSync(testFilePath, originalContent, 'utf-8');

      // Update only one setting
      updateSettingsFilePreservingFormat(testFilePath, {
        theme: 'Dracula',
        ideMode: true,
        hasSeenIdeIntegrationNudge: true,
        selectedAuthType: 'oauth-personal',
        mcpServers: {
          'sequential-thinking': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
          },
        },
        disableAutoUpdate: true, // Adding a new field
      });

      const updatedContent = fs.readFileSync(testFilePath, 'utf-8');

      // Should preserve the exact commented-out context7 configuration
      expect(updatedContent).toContain('// "context7": {');
      expect(updatedContent).toContain('//   "command": "npx",');
      expect(updatedContent).toContain('//   "args": [');
      expect(updatedContent).toContain('//     "-y",');
      expect(updatedContent).toContain('//     "@upstash/context7-mcp@latest"');
      expect(updatedContent).toContain('//   ]');
      expect(updatedContent).toContain('// },');

      // Should add the new field
      expect(updatedContent).toContain('"disableAutoUpdate": true');

      // Should NOT add generic comments
      expect(updatedContent).not.toContain('// MCP Servers configuration');
      expect(updatedContent).not.toContain('// General settings');
    });

    it('should create file if it does not exist', () => {
      expect(fs.existsSync(testFilePath)).toBe(false);

      updateSettingsFilePreservingFormat(testFilePath, {
        model: 'gemini-2.5-pro',
      });

      expect(fs.existsSync(testFilePath)).toBe(true);
      const content = fs.readFileSync(testFilePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.model).toBe('gemini-2.5-pro');
    });
  });

  describe('trackEnvVarMappings', () => {
    it('should track environment variable mappings', () => {
      const original = {
        apiKey: '$API_KEY',
        baseUrl: '${BASE_URL}',
        nested: {
          token: '$TOKEN',
          normal: 'value',
        },
      };

      const resolved = {
        apiKey: 'secret-123',
        baseUrl: 'https://api.example.com',
        nested: {
          token: 'token-456',
          normal: 'value',
        },
      };

      const mappings = trackEnvVarMappings(resolved, original);

      expect(mappings).toHaveLength(3);
      expect(mappings).toContainEqual({
        path: ['apiKey'],
        originalValue: '$API_KEY',
        resolvedValue: 'secret-123',
      });
      expect(mappings).toContainEqual({
        path: ['baseUrl'],
        originalValue: '${BASE_URL}',
        resolvedValue: 'https://api.example.com',
      });
      expect(mappings).toContainEqual({
        path: ['nested', 'token'],
        originalValue: '$TOKEN',
        resolvedValue: 'token-456',
      });
    });

    it('should not track non-environment variable values', () => {
      const original = {
        normal: 'value',
        number: 42,
        boolean: true,
      };

      const resolved = {
        normal: 'value',
        number: 42,
        boolean: true,
      };

      const mappings = trackEnvVarMappings(resolved, original);
      expect(mappings).toHaveLength(0);
    });

    it('should handle nested objects correctly', () => {
      const original = {
        level1: {
          level2: {
            envVar: '$DEEP_VAR',
            normal: 'text',
          },
        },
      };

      const resolved = {
        level1: {
          level2: {
            envVar: 'deep-value',
            normal: 'text',
          },
        },
      };

      const mappings = trackEnvVarMappings(resolved, original);

      expect(mappings).toHaveLength(1);
      expect(mappings[0]).toEqual({
        path: ['level1', 'level2', 'envVar'],
        originalValue: '$DEEP_VAR',
        resolvedValue: 'deep-value',
      });
    });
  });

  describe('integration with commented JSON', () => {
    it('should handle complex real-world settings file', () => {
      const complexContent = `{
  // General settings
  "model": "gemini-2.5-pro",
  
  // UI Configuration
  "ui": {
    "theme": "dark", // Can be "dark" or "light"
    "showLineNumbers": true,
    /* Multi-line comment
       about footer settings */
    "footer": {
      "hideCWD": false,
      "hideSandboxStatus": false
    }
  },
  
  // MCP Servers configuration
  "mcpServers": {
    // Active servers
    "context7": {
      "httpUrl": "https://mcp.context7.com/mcp",
      "headers": {
        "CONTEXT7_API_KEY": "$CONTEXT7_API_KEY" // Uses environment variable
      }
    },
    
    // Commented out servers
    /*
    "github": {
      "httpUrl": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer $GITHUB_TOKEN"
      }
    },
    */
    
    "time": {
      "command": "uvx",
      "args": ["mcp-server-time"]
    }
  },
  
  // Advanced settings
  "advanced": {
    "excludedEnvVars": ["DEBUG", "DEBUG_MODE"],
    "dnsResolutionOrder": "ipv4First" // IPv4 preferred
  }
}`;

      fs.writeFileSync(testFilePath, complexContent, 'utf-8');

      const envVarMappings = [
        {
          path: ['mcpServers', 'context7', 'headers', 'CONTEXT7_API_KEY'],
          originalValue: '$CONTEXT7_API_KEY',
          resolvedValue: 'actual-api-key',
        },
      ];

      // Update multiple settings
      updateSettingsFilePreservingFormat(
        testFilePath,
        {
          model: 'gemini-3.0-ultra',
          ui: {
            theme: 'light',
            showLineNumbers: true,
            footer: {
              hideCWD: true,
              hideSandboxStatus: false,
            },
          },
          mcpServers: {
            context7: {
              httpUrl: 'https://mcp.context7.com/mcp',
              headers: {
                CONTEXT7_API_KEY: 'actual-api-key',
              },
            },
            time: {
              command: 'uvx',
              args: ['mcp-server-time'],
            },
          },
          advanced: {
            excludedEnvVars: ['DEBUG', 'DEBUG_MODE', 'NODE_ENV'],
            dnsResolutionOrder: 'ipv4First',
          },
        },
        envVarMappings,
      );

      const updatedContent = fs.readFileSync(testFilePath, 'utf-8');

      // Verify all comments are preserved
      expect(updatedContent).toContain('// General settings');
      expect(updatedContent).toContain('// UI Configuration');
      expect(updatedContent).toContain('// Can be "dark" or "light"');
      expect(updatedContent).toContain('/* Multi-line comment');
      expect(updatedContent).toContain('about footer settings */');
      expect(updatedContent).toContain('// MCP Servers configuration');
      expect(updatedContent).toContain('// Active servers');
      expect(updatedContent).toContain('// Uses environment variable');
      expect(updatedContent).toContain('// Commented out servers');
      expect(updatedContent).toContain('/*');
      expect(updatedContent).toContain('"github": {');
      expect(updatedContent).toContain('*/');
      expect(updatedContent).toContain('// Advanced settings');
      expect(updatedContent).toContain('// IPv4 preferred');

      // Verify environment variable is preserved
      expect(updatedContent).toContain('"CONTEXT7_API_KEY": "$CONTEXT7_API_KEY"');
      expect(updatedContent).not.toContain('actual-api-key');

      // Verify updated values
      expect(updatedContent).toContain('"model": "gemini-3.0-ultra"');
      expect(updatedContent).toContain('"theme": "light"');
      expect(updatedContent).toContain('"hideCWD": true');
      expect(updatedContent).toContain('"NODE_ENV"');
    });
  });
});