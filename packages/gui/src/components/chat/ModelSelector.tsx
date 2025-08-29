import React, { useState } from 'react';
import { Check, ChevronRight, Bot } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';
import { multiModelService } from '@/services/multiModelService';
import { cn } from '@/utils/cn';
import type { ModelProviderType } from '@/types';

interface ModelSelectorProps {
  onClose: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ onClose }) => {
  const {
    currentProvider,
    currentModel,
    availableModels,
    setCurrentProvider,
    setCurrentModel
  } = useAppStore();
  
  const [selectedProvider, setSelectedProvider] = useState<ModelProviderType>(currentProvider);
  const [loading, setLoading] = useState(false);

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

  const handleProviderSelect = async (providerId: ModelProviderType) => {
    if (providerId === selectedProvider) return;
    
    setLoading(true);
    try {
      const models = await multiModelService.getAvailableModels(providerId);
      const providerModels = models[providerId];
      if (providerModels && providerModels.length > 0) {
        const firstModel = providerModels[0];
        await multiModelService.switchProvider(providerId, firstModel);
        setCurrentProvider(providerId);
        setCurrentModel(firstModel);
        setSelectedProvider(providerId);
        onClose();
      }
    } catch (error) {
      console.error('Failed to switch provider:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleModelSelect = async (model: string) => {
    if (model === currentModel) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      await multiModelService.switchProvider(selectedProvider, model);
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
    <Card className="w-96 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Select Model</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ×
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider Selection */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Provider</h4>
          <div className="space-y-1">
            {providers.map((provider) => (
              <Button
                key={provider.id}
                variant="ghost"
                className={cn(
                  "w-full justify-between h-auto p-3",
                  selectedProvider === provider.id && "bg-accent"
                )}
                onClick={() => handleProviderSelect(provider.id)}
                disabled={loading}
              >
                <div className="flex items-center gap-3">
                  {provider.icon}
                  <div className="text-left">
                    <div className="font-medium text-sm">{provider.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {provider.description}
                    </div>
                  </div>
                </div>
                <ChevronRight size={14} />
              </Button>
            ))}
          </div>
        </div>

        {/* Model Selection */}
        {selectedProviderModels.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Model</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {selectedProviderModels.map((model) => (
                <Button
                  key={model}
                  variant="ghost"
                  className={cn(
                    "w-full justify-between h-auto p-3",
                    currentModel === model && selectedProvider === currentProvider && "bg-accent"
                  )}
                  onClick={() => handleModelSelect(model)}
                  disabled={loading}
                >
                  <span className="font-mono text-sm">{model}</span>
                  {currentModel === model && selectedProvider === currentProvider && (
                    <Check size={14} className="text-primary" />
                  )}
                </Button>
              ))}
            </div>
          </div>
        )}

        {selectedProviderModels.length === 0 && selectedProvider && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            {loading ? 'Loading models...' : 'No models available for this provider'}
          </div>
        )}
      </CardContent>
    </Card>
  );
};