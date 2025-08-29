import React, { useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAppStore } from '@/stores/appStore';
import { multiModelService } from '@/services/multiModelService';

export const App: React.FC = () => {
  const { authConfig, currentProvider, currentModel, theme } = useAppStore();

  useEffect(() => {
    // Apply theme to document
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // System theme
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', isDark);
    }
  }, [theme]);

  useEffect(() => {
    // Initialize MultiModelService via Electron IPC
    const initializeService = async () => {
      // Wait for Electron API to be available
      let retries = 0;
      const maxRetries = 10;
      
      while (retries < maxRetries) {
        const electronAPI = (globalThis as { electronAPI?: { getWorkingDirectory: () => Promise<string> } }).electronAPI;
        if (electronAPI) {
          break;
        }
        console.log(`Waiting for Electron API... attempt ${retries + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
      
      try {
        
        // Get working directory via IPC instead of process.cwd()
        const electronAPI = (globalThis as { electronAPI?: { getWorkingDirectory: () => Promise<string> } }).electronAPI;
        if (!electronAPI) {
          throw new Error('Electron API not available after waiting');
        }
        const workingDirectory = await electronAPI.getWorkingDirectory();
        console.log('Working directory:', workingDirectory);
        
        const configParams = {
          sessionId: `gui-session-${Date.now()}`,
          targetDir: workingDirectory,
          debugMode: false,
          model: currentModel,
          cwd: workingDirectory,
          interactive: true,
          telemetry: { enabled: false }
        };
        
        await multiModelService.initialize(configParams);
      } catch (error) {
        console.error('Failed to initialize MultiModelService:', error);
      }
    };

    initializeService();
  }, [authConfig, currentProvider, currentModel]);

  return <AppLayout />;
};