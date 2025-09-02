import React, { useState, useEffect, useCallback } from 'react';
import { Check, Bot, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';
import { multiModelService } from '@/services/multiModelService';
import { cn } from '@/utils/cn';
import type { ModelProviderType } from '@/types';

interface ModelSelectorProps {
  onClose: () => void;
}

// localStorage key for caching
const MODELS_CACHE_KEY = 'gemini-cli-models-cache';

// Cache utilities
const getModelsFromCache = (): Record<string, string[]> | null => {
  try {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

const saveModelsToCache = (models: Record<string, string[]>) => {
  try {
    localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(models));
  } catch (error) {
    console.warn('Failed to save models to cache:', error);
  }
};

const saveProviderModelsToCache = (providerId: string, models: string[]) => {
  try {
    const cached = getModelsFromCache() || {};
    cached[providerId] = models;
    saveModelsToCache(cached);
  } catch (error) {
    console.warn('Failed to save provider models to cache:', error);
  }
};

const clearModelsCache = () => {
  try {
    localStorage.removeItem(MODELS_CACHE_KEY);
  } catch (error) {
    console.warn('Failed to clear models cache:', error);
  }
};

export const ModelSelector: React.FC<ModelSelectorProps> = ({ onClose }) => {
  const {
    currentProvider,
    currentModel,
    setCurrentProvider,
    setCurrentModel
  } = useAppStore();
  
  const [selectedProvider, setSelectedProvider] = useState<ModelProviderType>(currentProvider);
  const [loading, setLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({});

  const providers = [
    { 
      id: 'gemini' as ModelProviderType, 
      name: 'Google Gemini', 
      icon: <Bot className="text-blue-500" size={16} />,
      description: 'Advanced multimodal AI model'
    },
    { 
      id: 'openai' as ModelProviderType, 
      name: 'OpenAI', 
      icon: <Bot className="text-green-500" size={16} />,
      description: 'GPT models and assistants'
    },
    { 
      id: 'lm_studio' as ModelProviderType, 
      name: 'LM Studio', 
      icon: <Bot className="text-purple-500" size={16} />,
      description: 'Local models via LM Studio'
    },
    { 
      id: 'anthropic' as ModelProviderType, 
      name: 'Anthropic', 
      icon: <Bot className="text-orange-500" size={16} />,
      description: 'Claude models'
    }
  ];

  // Initialize with cached models on mount
  useEffect(() => {
    const cachedModels = getModelsFromCache();
    if (cachedModels) {
      setAvailableModels(cachedModels);
    }
  }, []);

  // Load models for specific provider
  const loadProviderModels = useCallback(async (providerId: ModelProviderType, forceRefresh = false) => {
    if (loadingProvider === providerId) return;
    
    // Check if we already have models for this provider and don't need to refresh
    if (!forceRefresh && availableModels[providerId]?.length > 0) {
      return;
    }
    
    setLoadingProvider(providerId);
    try {
      const models = await multiModelService.getAvailableModels(providerId);
      const providerModels = models[providerId] || [];
      
      setAvailableModels(prev => ({ ...prev, [providerId]: providerModels }));
      saveProviderModelsToCache(providerId, providerModels);
    } catch (error) {
      console.error(`Failed to load models for ${providerId}:`, error);
      setAvailableModels(prev => ({ ...prev, [providerId]: [] }));
    } finally {
      setLoadingProvider(null);
    }
  }, [availableModels, loadingProvider]);

  const handleProviderSelect = async (providerId: ModelProviderType) => {
    setSelectedProvider(providerId);
    
    // Load models for this provider if not already loaded
    if (!availableModels[providerId]?.length) {
      await loadProviderModels(providerId);
    }
  };

  const handleRefreshModels = async () => {
    if (selectedProvider) {
      await loadProviderModels(selectedProvider, true);
    }
  };

  const handleClearCache = () => {
    clearModelsCache();
    setAvailableModels({});
  };

  const handleModelSelect = async (model: string) => {
    if (model === currentModel && selectedProvider === currentProvider) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      await multiModelService.switchProvider(selectedProvider, model);
      setCurrentProvider(selectedProvider);
      setCurrentModel(model);
      onClose();
    } catch (error) {
      console.error('Failed to switch model:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedProviderModels = availableModels[selectedProvider] || [];

  return (
    <Card className="w-[600px] shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Select Model</h3>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearCache}
              title="Clear cache and reload all models"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[400px]">
        <div className="flex h-full gap-4">
          {/* Left Panel - Provider Selection */}
          <div className="w-[250px] space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Providers</h4>
            <div className="space-y-1">
              {providers.map((provider) => (
                <Button
                  key={provider.id}
                  variant="ghost"
                  className={cn(
                    "w-full justify-start h-auto p-3",
                    selectedProvider === provider.id && "bg-accent border-l-2 border-primary"
                  )}
                  onClick={() => handleProviderSelect(provider.id)}
                  disabled={loadingProvider === provider.id}
                >
                  <div className="flex items-center gap-3 w-full">
                    {provider.icon}
                    <div className="text-left flex-1">
                      <div className="font-medium text-sm">{provider.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {provider.description}
                      </div>
                    </div>
                    {loadingProvider === provider.id && (
                      <RefreshCw size={14} className="animate-spin" />
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Right Panel - Model Selection */}
          <div className="flex-1 border-l pl-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">
                Models {selectedProvider && `- ${providers.find(p => p.id === selectedProvider)?.name}`}
              </h4>
              {selectedProvider && selectedProviderModels.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshModels}
                  disabled={loadingProvider === selectedProvider}
                  className="h-6 px-2"
                >
                  <RefreshCw 
                    size={12} 
                    className={cn(
                      loadingProvider === selectedProvider && "animate-spin"
                    )} 
                  />
                  <span className="ml-1 text-xs">Refresh</span>
                </Button>
              )}
            </div>
            
            {/* Models List */}
            {selectedProvider ? (
              <div className="space-y-1 max-h-[320px] overflow-y-auto pr-2">
                {loadingProvider === selectedProvider ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <RefreshCw size={16} className="animate-spin mx-auto mb-2" />
                    Loading models...
                  </div>
                ) : selectedProviderModels.length > 0 ? (
                  selectedProviderModels.map((model) => (
                    <Button
                      key={model}
                      variant="ghost"
                      className={cn(
                        "w-full justify-between h-auto p-3 text-left",
                        currentModel === model && selectedProvider === currentProvider && "bg-accent border border-primary"
                      )}
                      onClick={() => handleModelSelect(model)}
                      disabled={loading}
                    >
                      <span className="font-mono text-sm flex-1 truncate">{model}</span>
                      {currentModel === model && selectedProvider === currentProvider && (
                        <Check size={14} className="text-primary flex-shrink-0 ml-2" />
                      )}
                    </Button>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Bot size={24} className="mx-auto mb-2 opacity-50" />
                    No models available for this provider
                    <br />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRefreshModels}
                      className="mt-2"
                    >
                      <RefreshCw size={12} className="mr-1" />
                      Try refresh
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Bot size={24} className="mx-auto mb-2 opacity-50" />
                Select a provider to view available models
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};