/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import type { MCPServerConfig } from '@google/gemini-cli-core';
import { McpServerForm } from './McpServerForm';
import './McpServerManager.css';

interface McpServerManagerProps {
  mcpServers: Record<string, MCPServerConfig>;
  onChange: (mcpServers: Record<string, MCPServerConfig>) => void;
}

function getServerSummary(config: MCPServerConfig): string {
  if (config.description) {
    return config.description;
  }
  if (config.command) {
    return `Stdio: ${config.command} ${config.args?.join(' ') || ''}`.trim();
  }
  if (config.url) {
    return `SSE URL: ${config.url}`;
  }
  if (config.httpUrl) {
    return `HTTP URL: ${config.httpUrl}`;
  }
  if (config.tcp) {
    return `Websocket: ${config.tcp}`;
  }
  return 'No transport configured';
}

export function McpServerManager({
  mcpServers,
  onChange,
}: McpServerManagerProps) {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [selectedServer, setSelectedServer] = useState<string | null>(null);

  const handleAdd = () => {
    setSelectedServer(null);
    setView('form');
  };

  const handleEdit = (name: string) => {
    setSelectedServer(name);
    setView('form');
  };

  const handleDelete = (name: string) => {
    const newServers = { ...mcpServers };
    delete newServers[name];
    onChange(newServers);
  };

  const handleSave = (
    name: string,
    config: MCPServerConfig,
    originalName?: string,
  ) => {
    const newServers = { ...mcpServers };
    if (originalName && originalName !== name) {
      delete newServers[originalName];
    }
    newServers[name] = config;
    onChange(newServers);
    setView('list');
  };

  if (view === 'form') {
    return (
      <McpServerForm
        serverName={selectedServer}
        serverConfig={selectedServer ? mcpServers[selectedServer] : undefined}
        onSave={handleSave}
        onCancel={() => setView('list')}
      />
    );
  }

  return (
    <div>
      <div className="setting-item">
        <div className="setting-info">
          <label>Configured MCP Servers</label>
          <p>Manage your Model-Centric Programming (MCP) servers.</p>
        </div>
        <div className="setting-control">
          <button className="add-new-server-button" onClick={handleAdd}>
            Add New Server
          </button>
        </div>
      </div>
      <div className="mcp-server-list">
        {Object.keys(mcpServers).length === 0 ? (
          <div className="setting-item">
            <p>No MCP servers configured.</p>
          </div>
        ) : (
          Object.entries(mcpServers).map(([name, config]) => (
            <div className="setting-item" key={name}>
              <div className="setting-info">
                <label>{name}</label>
                <p>{getServerSummary(config)}</p>
              </div>
              <div className="setting-control">
                <button onClick={() => handleEdit(name)}>Edit</button>
                <button onClick={() => handleDelete(name)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
