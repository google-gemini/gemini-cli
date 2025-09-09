import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Shield, ShieldCheck, ShieldX } from 'lucide-react';
import { multiModelService } from '@/services/multiModelService';
import { useChatStore } from '@/stores/chatStore';

export const ToolModeStatusBar: React.FC = () => {
  const { approvalMode, setApprovalMode } = useChatStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCurrentMode();
  }, []);

  const loadCurrentMode = async () => {
    try {
      const mode = await multiModelService.getApprovalMode();
      setApprovalMode(mode);
    } catch (error) {
      console.error('Failed to load approval mode:', error);
    }
  };

  const handleModeChange = async (newMode: typeof approvalMode) => {
    if (loading) return;
    
    setLoading(true);
    try {
      await multiModelService.setApprovalMode(newMode);
      setApprovalMode(newMode);
    } catch (error) {
      console.error('Failed to update approval mode:', error);
    } finally {
      setLoading(false);
    }
  };

  // Only show when not in default mode
  if (approvalMode === 'default') {
    return null;
  }

  const getModeConfig = () => {
    switch (approvalMode) {
      case 'autoEdit':
        return {
          icon: <ShieldCheck className="w-4 h-4" />,
          label: 'Auto Edit',
          description: 'File edits auto-approved',
          bgColor: 'bg-blue-50 dark:bg-blue-950/20',
          borderColor: 'border-blue-200 dark:border-blue-800',
          textColor: 'text-blue-800 dark:text-blue-200'
        };
      case 'yolo':
        return {
          icon: <ShieldX className="w-4 h-4" />,
          label: 'No Confirmations',
          description: 'All tools auto-approved',
          bgColor: 'bg-orange-50 dark:bg-orange-950/20',
          borderColor: 'border-orange-200 dark:border-orange-800',
          textColor: 'text-orange-800 dark:text-orange-200'
        };
      default:
        return null;
    }
  };

  const config = getModeConfig();
  if (!config) return null;

  return (
    <div className={`mx-4 mb-3 p-3 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`${config.textColor}`}>
            {config.icon}
          </div>
          <div>
            <div className={`text-sm font-medium ${config.textColor}`}>
              {config.label} Mode Active
            </div>
            <div className={`text-xs ${config.textColor} opacity-75`}>
              {config.description}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleModeChange('default')}
            disabled={loading}
            className="h-7 text-xs"
          >
            <Shield className="w-3 h-3 mr-1" />
            Enable Confirmations
          </Button>
        </div>
      </div>
    </div>
  );
};