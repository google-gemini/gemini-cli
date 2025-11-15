/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import '@xterm/xterm/css/xterm.css';
import { SettingsProvider } from './contexts/SettingsContext';
import { ErrorBoundary } from './components/Core/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
