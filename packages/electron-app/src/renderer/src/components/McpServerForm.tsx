/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type { MCPServerConfig } from '@google/gemini-cli-core';
import './McpServerForm.css';

interface McpServerFormProps {
  serverName: string | null;
  serverConfig?: MCPServerConfig;
  onSave: (
    name: string,
    config: MCPServerConfig,
    originalName?: string,
  ) => void;
  onCancel: () => void;
}

export function McpServerForm({
  serverName,
  serverConfig,
  onSave,
  onCancel,
}: McpServerFormProps) {
  const [name, setName] = useState(serverName || '');
  const [config, setConfig] = useState<Partial<MCPServerConfig>>(
    serverConfig || {},
  );
  // Separate state for the raw JSON string to avoid losing user input
  const [headersJson, setHeadersJson] = useState('');
  const [envJson, setEnvJson] = useState('');

  useEffect(() => {
    setName(serverName || '');
    const initialConfig = serverConfig || {};
    setConfig(initialConfig);
    setHeadersJson(
      initialConfig.headers
        ? JSON.stringify(initialConfig.headers, null, 2)
        : '',
    );
    setEnvJson(
      initialConfig.env ? JSON.stringify(initialConfig.env, null, 2) : '',
    );
  }, [serverName, serverConfig]);

  const handleSave = () => {
    // The constructor properties are readonly, so we can't just cast.
    // We need to create a new object with the properties.
    const newConfig = {
      command: config.command,
      args: config.args,
      env: config.env,
      cwd: config.cwd,
      url: config.url,
      httpUrl: config.httpUrl,
      headers: config.headers,
      tcp: config.tcp,
      timeout: config.timeout,
      trust: config.trust,
      description: config.description,
      includeTools: config.includeTools,
      excludeTools: config.excludeTools,
      extensionName: config.extensionName,
      oauth: config.oauth,
      authProviderType: config.authProviderType,
    };
    onSave(name, newConfig, serverName || undefined);
  };

  const handleChange = (
    field: keyof MCPServerConfig,
    value: string | boolean | number | string[] | Record<string, string> | undefined,
  ) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleStringArrayChange = (
    field: 'args' | 'includeTools' | 'excludeTools',
    value: string,
  ) => {
    handleChange(
      field,
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  };

  const handleRecordChange = (
    field: 'env' | 'headers',
    value: string,
    setter: (val: string) => void,
  ) => {
    setter(value); // Update the raw JSON string immediately
    try {
      // Only update the actual config if the JSON is valid
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        handleChange(field, parsed);
      }
    } catch (_e) {
      // If JSON is invalid, do nothing with the config,
      // but the user's input is preserved in the textarea.
      handleChange(field, undefined);
    }
  };

  return (
    <div className="mcp-server-form">
      <h3>{serverName ? 'Edit' : 'Add'} MCP Server</h3>

      <div className="form-item">
        <label htmlFor="name">Server Name</label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <h4>General</h4>
      <div className="form-item">
        <label htmlFor="description">Description</label>
        <input
          type="text"
          id="description"
          value={config.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
        />
      </div>

      <h4>Transport</h4>
      <p>
        Configure one of the transport methods (stdio, sse, http, websocket).
      </p>

      <h5>Stdio</h5>
      <div className="form-item">
        <label htmlFor="command">Command</label>
        <input
          type="text"
          id="command"
          value={config.command || ''}
          onChange={(e) => handleChange('command', e.target.value)}
        />
      </div>
      <div className="form-item">
        <label htmlFor="args">Arguments (comma-separated)</label>
        <input
          type="text"
          id="args"
          value={config.args?.join(', ') || ''}
          onChange={(e) => handleStringArrayChange('args', e.target.value)}
        />
      </div>
      <div className="form-item">
        <label htmlFor="cwd">Working Directory</label>
        <input
          type="text"
          id="cwd"
          value={config.cwd || ''}
          onChange={(e) => handleChange('cwd', e.target.value)}
        />
      </div>
      <div className="form-item">
        <label htmlFor="env">Environment Variables (JSON)</label>
        <textarea
          id="env"
          value={envJson}
          onChange={(e) => handleRecordChange('env', e.target.value, setEnvJson)}
        />
      </div>

      <h5>SSE</h5>
      <div className="form-item">
        <label htmlFor="url">URL</label>
        <input
          type="text"
          id="url"
          value={config.url || ''}
          onChange={(e) => handleChange('url', e.target.value)}
        />
      </div>

      <h5>HTTP</h5>
      <div className="form-item">
        <label htmlFor="httpUrl">HTTP URL</label>
        <input
          type="text"
          id="httpUrl"
          value={config.httpUrl || ''}
          onChange={(e) => handleChange('httpUrl', e.target.value)}
        />
      </div>
      <div className="form-item">
        <label htmlFor="headers">Headers (JSON)</label>
        <textarea
          id="headers"
          value={headersJson}
          onChange={(e) =>
            handleRecordChange('headers', e.target.value, setHeadersJson)
          }
        />
      </div>

      <h5>Websocket</h5>
      <div className="form-item">
        <label htmlFor="tcp">TCP Address</label>
        <input
          type="text"
          id="tcp"
          value={config.tcp || ''}
          onChange={(e) => handleChange('tcp', e.target.value)}
        />
      </div>

      <h4>Common</h4>
      <div className="form-item">
        <label htmlFor="timeout">Timeout (ms)</label>
        <input
          type="number"
          id="timeout"
          value={config.timeout || ''}
          onChange={(e) =>
            handleChange('timeout', parseInt(e.target.value, 10))
          }
        />
      </div>
      <div className="form-item">
        <label htmlFor="trust">Trust Server</label>
        <input
          type="checkbox"
          id="trust"
          checked={!!config.trust}
          onChange={(e) => handleChange('trust', e.target.checked)}
        />
      </div>

      <h4>Tools</h4>
      <div className="form-item">
        <label htmlFor="includeTools">Include Tools (comma-separated)</label>
        <input
          type="text"
          id="includeTools"
          value={config.includeTools?.join(', ') || ''}
          onChange={(e) =>
            handleStringArrayChange('includeTools', e.target.value)
          }
        />
      </div>
      <div className="form-item">
        <label htmlFor="excludeTools">Exclude Tools (comma-separated)</label>
        <input
          type="text"
          id="excludeTools"
          value={config.excludeTools?.join(', ') || ''}
          onChange={(e) =>
            handleStringArrayChange('excludeTools', e.target.value)
          }
        />
      </div>

      {/* Not including oauth for now as it is a complex object */}

      <div className="form-actions">
        <button onClick={handleSave}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
