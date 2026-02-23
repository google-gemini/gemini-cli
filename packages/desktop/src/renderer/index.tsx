import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
