/**
 * @license
 * Copyright 2025 Trust Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, Newline, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { TrustModelManagerImpl, TrustConfiguration, globalPerformanceMonitor } from '@trustos/trust-cli-core';
import { TrustModelConfig } from '@trustos/trust-cli-core';

interface ModelManagerUIProps {
  onExit: () => void;
}

type ViewMode = 'list' | 'detail' | 'download' | 'benchmark' | 'settings';

interface UIState {
  view: ViewMode;
  models: TrustModelConfig[];
  selectedModel: TrustModelConfig | null;
  selectedIndex: number;
  loading: boolean;
  message: string;
  error: string;
  downloadProgress?: { model: string; progress: number; speed: string; eta: string };
}

export const ModelManagerUI: React.FC<ModelManagerUIProps> = ({ onExit }) => {
  const [state, setState] = useState<UIState>({
    view: 'list',
    models: [],
    selectedModel: null,
    selectedIndex: 0,
    loading: true,
    message: '',
    error: '',
  });

  const [config, setConfig] = useState<TrustConfiguration | null>(null);
  const [modelManager, setModelManager] = useState<TrustModelManagerImpl | null>(null);

  // Initialize components
  useEffect(() => {
    const initializeComponents = async () => {
      try {
        const trustConfig = new TrustConfiguration();
        await trustConfig.initialize();
        
        const manager = new TrustModelManagerImpl(trustConfig.getModelsDirectory());
        await manager.initialize();
        
        const models = manager.listAvailableModels();
        const currentModel = manager.getCurrentModel();
        
        setConfig(trustConfig);
        setModelManager(manager);
        setState(prev => ({
          ...prev,
          models,
          selectedModel: currentModel,
          loading: false,
        }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: `Initialization failed: ${error}`,
          loading: false,
        }));
      }
    };

    initializeComponents();
  }, []);

  // Handle keyboard input
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onExit();
      return;
    }

    if (state.loading) return;

    switch (state.view) {
      case 'list':
        handleListInput(input, key);
        break;
      case 'detail':
        handleDetailInput(input, key);
        break;
      case 'download':
        handleDownloadInput(input, key);
        break;
      case 'benchmark':
        handleBenchmarkInput(input, key);
        break;
      case 'settings':
        handleSettingsInput(input, key);
        break;
    }
  });

  const handleListInput = (input: string, key: any) => {
    if (key.upArrow && state.selectedIndex > 0) {
      setState(prev => ({ ...prev, selectedIndex: prev.selectedIndex - 1 }));
    } else if (key.downArrow && state.selectedIndex < state.models.length - 1) {
      setState(prev => ({ ...prev, selectedIndex: prev.selectedIndex + 1 }));
    } else if (key.return || input === ' ') {
      const model = state.models[state.selectedIndex];
      setState(prev => ({ 
        ...prev, 
        view: 'detail', 
        selectedModel: model 
      }));
    } else if (input === 'd') {
      setState(prev => ({ ...prev, view: 'download' }));
    } else if (input === 'b') {
      setState(prev => ({ ...prev, view: 'benchmark' }));
    } else if (input === 's') {
      setState(prev => ({ ...prev, view: 'settings' }));
    } else if (input === 'r') {
      refreshModelList();
    }
  };

  const handleDetailInput = (input: string, key: any) => {
    if (key.escape || input === 'b') {
      setState(prev => ({ ...prev, view: 'list' }));
    } else if (input === 's' && state.selectedModel && modelManager) {
      switchToModel(state.selectedModel);
    } else if (input === 'v' && state.selectedModel && modelManager) {
      verifyModel(state.selectedModel);
    } else if (input === 'd' && state.selectedModel && modelManager) {
      downloadModel(state.selectedModel.name);
    }
  };

  const handleDownloadInput = (input: string, key: any) => {
    if (key.escape || input === 'b') {
      setState(prev => ({ ...prev, view: 'list' }));
    }
  };

  const handleBenchmarkInput = (input: string, key: any) => {
    if (key.escape || input === 'b') {
      setState(prev => ({ ...prev, view: 'list' }));
    }
  };

  const handleSettingsInput = (input: string, key: any) => {
    if (key.escape || input === 'b') {
      setState(prev => ({ ...prev, view: 'list' }));
    }
  };

  const refreshModelList = async () => {
    if (!modelManager) return;
    
    setState(prev => ({ ...prev, loading: true }));
    try {
      const models = modelManager.listAvailableModels();
      const currentModel = modelManager.getCurrentModel();
      setState(prev => ({
        ...prev,
        models,
        selectedModel: currentModel,
        loading: false,
        message: 'Model list refreshed',
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `Failed to refresh: ${error}`,
        loading: false,
      }));
    }
  };

  const switchToModel = async (model: TrustModelConfig) => {
    if (!modelManager) return;
    
    setState(prev => ({ ...prev, loading: true }));
    try {
      await modelManager.switchModel(model.name);
      setState(prev => ({
        ...prev,
        selectedModel: model,
        loading: false,
        message: `Switched to ${model.name}`,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `Failed to switch model: ${error}`,
        loading: false,
      }));
    }
  };

  const verifyModel = async (model: TrustModelConfig) => {
    if (!modelManager) return;
    
    setState(prev => ({ ...prev, loading: true }));
    try {
      const integrity = await modelManager.verifyModelIntegrity(model.name);
      setState(prev => ({
        ...prev,
        loading: false,
        message: integrity.message,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `Verification failed: ${error}`,
        loading: false,
      }));
    }
  };

  const downloadModel = async (modelName: string) => {
    if (!modelManager) return;
    
    setState(prev => ({ ...prev, loading: true, view: 'download' }));
    try {
      // This would implement progress tracking in a real scenario
      await modelManager.downloadModel(modelName);
      setState(prev => ({
        ...prev,
        loading: false,
        message: `Downloaded ${modelName}`,
        view: 'list',
      }));
      refreshModelList();
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `Download failed: ${error}`,
        loading: false,
        view: 'list',
      }));
    }
  };

  if (state.loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Spinner type="dots" />
          <Text> Loading Trust Model Manager...</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header />
      <Newline />
      
      {state.error && (
        <>
          <Box borderStyle="round" borderColor="red" padding={1}>
            <Text color="red">❌ {state.error}</Text>
          </Box>
          <Newline />
        </>
      )}
      
      {state.message && (
        <>
          <Box borderStyle="round" borderColor="green" padding={1}>
            <Text color="green">✅ {state.message}</Text>
          </Box>
          <Newline />
        </>
      )}

      {state.view === 'list' && <ModelListView state={state} />}
      {state.view === 'detail' && <ModelDetailView state={state} />}
      {state.view === 'download' && <DownloadView state={state} />}
      {state.view === 'benchmark' && <BenchmarkView state={state} />}
      {state.view === 'settings' && <SettingsView state={state} config={config} />}
      
      <Newline />
      <NavigationHelp view={state.view} />
    </Box>
  );
};

const Header: React.FC = () => (
  <Box borderStyle="double" borderColor="blue" padding={1}>
    <Box flexDirection="column" width="100%">
      <Text color="blue" bold>🛡️  Trust CLI - Advanced Model Manager</Text>
      <Text color="gray">Trust: An Open System for Modern Assurance</Text>
    </Box>
  </Box>
);

const ModelListView: React.FC<{ state: UIState }> = ({ state }) => (
  <Box flexDirection="column">
    <Text bold>📦 Available Models</Text>
    <Text color="gray">Use ↑↓ to navigate, Enter to view details</Text>
    <Newline />
    
    {state.models.map((model, index) => (
      <ModelListItem 
        key={model.name}
        model={model}
        isSelected={index === state.selectedIndex}
        isCurrent={state.selectedModel?.name === model.name}
      />
    ))}
  </Box>
);

const ModelListItem: React.FC<{
  model: TrustModelConfig;
  isSelected: boolean;
  isCurrent: boolean;
}> = ({ model, isSelected, isCurrent }) => {
  const indicator = isCurrent ? '→' : ' ';
  const selector = isSelected ? '▶' : ' ';
  const status = model.verificationHash ? '✓' : '✗';
  
  return (
    <Box>
      <Text color={isSelected ? 'blue' : undefined} backgroundColor={isSelected ? 'white' : undefined}>
        {selector} {indicator} {model.name} [{status}]
      </Text>
      <Text color="gray"> - {model.description}</Text>
    </Box>
  );
};

const ModelDetailView: React.FC<{ state: UIState }> = ({ state }) => {
  if (!state.selectedModel) return <Text>No model selected</Text>;
  
  const model = state.selectedModel;
  
  return (
    <Box flexDirection="column">
      <Text bold>📋 Model Details: {model.name}</Text>
      <Newline />
      
      <Box flexDirection="column" marginLeft={2}>
        <Text><Text bold>Description:</Text> {model.description}</Text>
        <Text><Text bold>Type:</Text> {model.type}</Text>
        <Text><Text bold>Parameters:</Text> {model.parameters}</Text>
        <Text><Text bold>RAM Required:</Text> {model.ramRequirement}</Text>
        <Text><Text bold>Trust Score:</Text> {model.trustScore}/10</Text>
        <Text><Text bold>Quantization:</Text> {model.quantization}</Text>
        <Text><Text bold>Context Size:</Text> {model.contextSize} tokens</Text>
        <Text><Text bold>Path:</Text> {model.path}</Text>
        
        {model.verificationHash && (
          <Text><Text bold>Hash:</Text> {model.verificationHash.substring(0, 20)}...</Text>
        )}
        
        {model.downloadUrl && (
          <Text><Text bold>Download URL:</Text> {model.downloadUrl}</Text>
        )}
      </Box>
    </Box>
  );
};

const DownloadView: React.FC<{ state: UIState }> = ({ state }) => (
  <Box flexDirection="column">
    <Text bold>⬇️ Model Downloads</Text>
    <Newline />
    
    {state.downloadProgress ? (
      <Box flexDirection="column">
        <Text>Downloading: {state.downloadProgress.model}</Text>
        <Text>Progress: {state.downloadProgress.progress}%</Text>
        <Text>Speed: {state.downloadProgress.speed}</Text>
        <Text>ETA: {state.downloadProgress.eta}</Text>
      </Box>
    ) : (
      <Text>No downloads in progress</Text>
    )}
  </Box>
);

const BenchmarkView: React.FC<{ state: UIState }> = ({ state }) => {
  const stats = globalPerformanceMonitor.getInferenceStats();
  const systemMetrics = globalPerformanceMonitor.getSystemMetrics();
  
  return (
    <Box flexDirection="column">
      <Text bold>📊 Performance Benchmarks</Text>
      <Newline />
      
      <Box flexDirection="column" marginLeft={2}>
        <Text bold>System Performance:</Text>
        <Text>Platform: {systemMetrics.platform}</Text>
        <Text>Total RAM: {Math.floor(systemMetrics.memoryUsage.total / (1024**3))}GB</Text>
        <Text>Available RAM: {Math.floor(systemMetrics.memoryUsage.available / (1024**3))}GB</Text>
        <Text>Load Average: {systemMetrics.loadAverage[0].toFixed(2)}</Text>
        <Newline />
        
        <Text bold>Inference Statistics:</Text>
        <Text>Total Inferences: {stats.totalInferences}</Text>
        <Text>Average Speed: {stats.averageTokensPerSecond.toFixed(1)} tokens/sec</Text>
        <Text>Average Time: {stats.averageInferenceTime.toFixed(0)}ms</Text>
        
        {state.selectedModel && (
          <>
            <Newline />
            <Text bold>Current Model: {state.selectedModel.name}</Text>
            <Text>Trust Score: {state.selectedModel.trustScore}/10</Text>
            <Text>RAM Requirement: {state.selectedModel.ramRequirement}</Text>
          </>
        )}
      </Box>
    </Box>
  );
};

const SettingsView: React.FC<{ 
  state: UIState; 
  config: TrustConfiguration | null; 
}> = ({ state, config }) => {
  if (!config) return <Text>Configuration not available</Text>;
  
  const settings = config.get();
  
  return (
    <Box flexDirection="column">
      <Text bold>⚙️ Trust Configuration</Text>
      <Newline />
      
      <Box flexDirection="column" marginLeft={2}>
        <Text bold>Privacy Settings:</Text>
        <Text>Privacy Mode: {settings.privacy.privacyMode}</Text>
        <Text>Model Verification: {settings.privacy.modelVerification ? 'enabled' : 'disabled'}</Text>
        <Text>Audit Logging: {settings.privacy.auditLogging ? 'enabled' : 'disabled'}</Text>
        <Newline />
        
        <Text bold>Model Settings:</Text>
        <Text>Default Model: {settings.models.default}</Text>
        <Text>Models Directory: {settings.models.directory}</Text>
        <Text>Auto Verify: {settings.models.autoVerify ? 'enabled' : 'disabled'}</Text>
        <Newline />
        
        <Text bold>Inference Settings:</Text>
        <Text>Temperature: {settings.inference.temperature}</Text>
        <Text>Top P: {settings.inference.topP}</Text>
        <Text>Max Tokens: {settings.inference.maxTokens}</Text>
        <Text>Streaming: {settings.inference.stream ? 'enabled' : 'disabled'}</Text>
      </Box>
    </Box>
  );
};

const NavigationHelp: React.FC<{ view: ViewMode }> = ({ view }) => {
  const helpText = {
    list: '↑↓: Navigate • Enter: Details • D: Downloads • B: Benchmark • S: Settings • R: Refresh • Q: Quit',
    detail: 'S: Switch Model • V: Verify • D: Download • B: Back • Q: Quit',
    download: 'B: Back • Q: Quit',
    benchmark: 'B: Back • Q: Quit',
    settings: 'B: Back • Q: Quit',
  };
  
  return (
    <Box borderStyle="round" borderColor="gray" padding={1}>
      <Text color="gray">{helpText[view]}</Text>
    </Box>
  );
};